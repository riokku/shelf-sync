import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import * as THREE from 'three';

/** Recent pointer samples while dragging a crate, used to estimate a
 *  release velocity for the throw — see FloatingCrate.dragSamples. */
interface DragSample {
  x: number;
  y: number;
  t: number;
}

interface FloatingCrate {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  edges: THREE.LineSegments;
  paletteIndex: number;
  baseY: number;
  bobSpeed: number;
  bobAmplitude: number;
  bobOffset: number;
  spinSpeed: THREE.Vector3;
  /** Once grabbed for the first time, a crate leaves the ambient tumble/bob
   *  loop for good and switches to physics (see updatePhysics()) — it stays
   *  "live" (grabbable, subject to gravity) even after settling, rather
   *  than ever rejoining the ambient set. */
  thrown: boolean;
  dragging: boolean;
  dragSamples: DragSample[];
  velocity: THREE.Vector2;
}

/** World-space bounds a thrown crate bounces around inside — see
 *  computeBounds(). Deliberately narrower than the full camera frustum:
 *  minX stays clear of the left-aligned heading text this scene sits
 *  behind (same bias the ambient placement already uses), so a thrown
 *  crate can't end up somewhere the user can no longer click to grab it
 *  again (the heading paints on top of the canvas there, see this
 *  component's own :host z-index). */
interface PhysicsBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const GRAVITY = 9;
const RESTITUTION = 0.45;
const FLOOR_FRICTION = 0.9;
const REST_SPEED = 0.05;
const MAX_THROW_SPEED = 14;
const DRAG_SAMPLE_WINDOW_MS = 120;

/** Replaces Home's old flat CSS "glow blob" backdrop (see
 *  home.component.scss's own former home-hero-glow/-float) with a small
 *  three.js scene: a loose cluster of low-poly crates that slowly tumble
 *  and bob in place behind the "Welcome back" heading, until the visitor
 *  grabs one — then it's a physics toy: drag it around and let go to throw
 *  it, and it bounces/settles under gravity within the scene's own bounds
 *  (see PhysicsBounds/updatePhysics()). Self-contained (owns its own
 *  renderer/animation loop/pointer handling/cleanup) so HomeComponent
 *  itself stays three.js-agnostic — it just drops this in where the old
 *  glow span used to sit.
 *
 *  Deliberately restrained rather than a full "3D hero" moment: this is a
 *  utility dashboard someone lands on every session, not a marketing page,
 *  so the cluster is muted (transparent, low-opacity materials), biased
 *  toward the right/lower part of the frame (away from the left-aligned
 *  heading text it sits behind), and capped at a modest device-pixel-ratio
 *  and polygon count — a handful of boxes, no textures, no shadows, no
 *  post-processing. The physics itself is hand-rolled (gravity + bounce +
 *  friction against a fixed set of bounds) rather than a real physics
 *  engine — plenty convincing for half a dozen boxes that never collide
 *  with each other, and doesn't add a second, heavier dependency on top of
 *  three.js itself.
 *
 *  Colors are read from the live theme's own --mat-sys-primary/-tertiary
 *  tokens (same "recolors itself per-organization" convention the old glow
 *  and landing's own hero gradient already use), re-read whenever the
 *  <html> element's data-theme/data-mode attributes change (site color
 *  preset or light/dark toggle) — unlike a plain CSS gradient, three.js
 *  bakes color into JS state at creation time, so it needs its own
 *  MutationObserver to stay in sync with a theme change made without
 *  leaving this page.
 *
 *  prefers-reduced-motion gets the old non-interactive behavior verbatim —
 *  one static rendered frame, no pointer handling set up at all — rather
 *  than a throw-without-followup-animation compromise: someone who's
 *  opted out of motion is a poor audience for a physics toy regardless of
 *  how it's tuned, so this stays exactly as inert as it already was for
 *  them before this feature existed. */
@Component({
  selector: 'app-hero-crates-scene',
  template: `<canvas #canvas></canvas>`,
  styleUrl: './hero-crates-scene.component.scss'
})
export class HeroCratesSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;
  private hostRef = inject(ElementRef<HTMLElement>);
  private ngZone = inject(NgZone);

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private readonly crates: FloatingCrate[] = [];
  private readonly clock = new THREE.Clock();
  private frameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly bounds: PhysicsBounds = { minX: -3, maxX: 3, minY: -2, maxY: 2 };
  private draggingCrate: FloatingCrate | null = null;
  private readonly dragPlane = new THREE.Plane();
  private readonly dragPoint = new THREE.Vector3();
  private onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private onPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
  private onPointerUp = (event: PointerEvent) => this.handlePointerUp(event);

  ngAfterViewInit() {
    // The whole scene — renderer, rAF loop, pointer/Resize/Mutation
    // observer callbacks — runs outside Angular's zone: none of it ever
    // touches a template binding, so there's nothing here that needs
    // change detection. Left inside the zone, zone.js's own
    // requestAnimationFrame patch keeps the app permanently "unstable" (a
    // recursive rAF loop never lets NgZone go idle), which breaks anything
    // that waits on stability — ApplicationRef.isStable, fixture.whenStable()
    // in tests (this is what surfaced it: every HomeComponent spec hung
    // until Jasmine's own timeout), etc.
    this.ngZone.runOutsideAngular(() => {
      try {
        this.setupScene();
      } catch {
        // WebGL unavailable/blocked (old hardware, a locked-down browser
        // profile, etc.) — the hero reads fine with nothing behind it, same
        // as before this feature existed, so this fails silently rather
        // than surfacing an error the user can't act on.
      }
    });
  }

  ngOnDestroy() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
    }
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    for (const crate of this.crates) {
      crate.mesh.geometry.dispose();
      crate.material.dispose();
      crate.edges.geometry.dispose();
      (crate.edges.material as THREE.Material).dispose();
    }
    this.renderer?.dispose();
  }

  private setupScene() {
    const host = this.hostRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 9);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(3, 4, 5);
    scene.add(directional);

    // Varied sizes read as a mixed shipment of boxes/crates rather than a
    // repeated tile. Positions are biased positive on x/negative-to-mid on
    // y (right and lower-middle of the frame) — see this class's own doc
    // comment for why: the heading text this sits behind starts flush left.
    const sizes = [1.1, 0.75, 0.9, 0.6, 1, 0.7];
    for (let i = 0; i < sizes.length; i++) {
      const geometry = new THREE.BoxGeometry(sizes[i], sizes[i], sizes[i]);
      const material = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.5,
        roughness: 0.6,
        metalness: 0.1
      });
      const mesh = new THREE.Mesh(geometry, material);

      const x = 1.5 + Math.random() * 4.5;
      const y = -1.5 + Math.random() * 3;
      const z = -2 + Math.random() * 3;
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      // A subtle light-line outline per crate — cheap (just the box's own
      // edge geometry) but reads as a deliberate "line art on a solid" look
      // rather than plain untextured boxes.
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
      );
      mesh.add(edges);

      scene.add(mesh);
      this.crates.push({
        mesh,
        material,
        edges,
        paletteIndex: i % 2,
        baseY: y,
        bobSpeed: 0.3 + Math.random() * 0.3,
        bobAmplitude: 0.15 + Math.random() * 0.15,
        bobOffset: Math.random() * Math.PI * 2,
        spinSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.3
        ),
        thrown: false,
        dragging: false,
        dragSamples: [],
        velocity: new THREE.Vector2(0, 0)
      });
    }

    this.applyThemeColors();
    this.themeObserver = new MutationObserver(() => this.applyThemeColors());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });

    this.resizeToHost();
    this.resizeObserver = new ResizeObserver(() => this.resizeToHost());
    this.resizeObserver.observe(host);

    if (this.reducedMotion) {
      renderer.render(scene, camera);
      return;
    }

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);

    const animate = () => {
      const delta = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;
      for (const crate of this.crates) {
        if (crate.dragging) {
          continue;
        }
        if (!crate.thrown) {
          crate.mesh.rotation.x += crate.spinSpeed.x * delta;
          crate.mesh.rotation.y += crate.spinSpeed.y * delta;
          crate.mesh.rotation.z += crate.spinSpeed.z * delta;
          crate.mesh.position.y = crate.baseY + Math.sin(elapsed * crate.bobSpeed + crate.bobOffset) * crate.bobAmplitude;
        } else {
          this.updatePhysics(crate, delta);
        }
      }
      renderer.render(scene, camera);
      this.frameId = requestAnimationFrame(animate);
    };
    animate();
  }

  /** Gravity + bounce-off-bounds + floor friction for one already-thrown
   *  crate — see this class's own doc comment for why this is hand-rolled
   *  rather than a physics library. Z stays fixed at whatever depth the
   *  crate was grabbed at (see handlePointerDown's drag plane) — a thrown
   *  crate only ever moves in the screen-facing x/y plane, matching "throw
   *  it around the screen" rather than a fully free 3D toss. */
  private updatePhysics(crate: FloatingCrate, delta: number) {
    const { velocity, mesh } = crate;
    velocity.y -= GRAVITY * delta;
    mesh.position.x += velocity.x * delta;
    mesh.position.y += velocity.y * delta;

    if (mesh.position.x < this.bounds.minX) {
      mesh.position.x = this.bounds.minX;
      velocity.x *= -RESTITUTION;
    } else if (mesh.position.x > this.bounds.maxX) {
      mesh.position.x = this.bounds.maxX;
      velocity.x *= -RESTITUTION;
    }

    if (mesh.position.y < this.bounds.minY) {
      mesh.position.y = this.bounds.minY;
      velocity.y *= -RESTITUTION;
      velocity.x *= FLOOR_FRICTION;
    } else if (mesh.position.y > this.bounds.maxY) {
      mesh.position.y = this.bounds.maxY;
      velocity.y *= -RESTITUTION;
    }

    // Settled on the floor — snap the last bit of jitter to a full stop
    // rather than bouncing forever at a shrinking, barely-visible amplitude.
    if (mesh.position.y <= this.bounds.minY + 0.001 && Math.abs(velocity.y) < REST_SPEED) {
      velocity.y = 0;
      velocity.x *= FLOOR_FRICTION;
      if (Math.abs(velocity.x) < REST_SPEED) {
        velocity.x = 0;
      }
    }

    // Tumble while airborne/moving, proportional to speed; settles toward
    // stillness as velocity decays, same as the ambient crates' own
    // constant spinSpeed but driven by motion instead of a fixed rate.
    mesh.rotation.x += velocity.y * 0.3 * delta;
    mesh.rotation.z += velocity.x * 0.3 * delta;
  }

  /** Recomputes the world-space bounds a thrown crate bounces around
   *  inside, from the camera's actual frustum at z=0 — called on setup and
   *  every resize so the play area always matches however large the
   *  rendered canvas currently is. minX stays fixed rather than tracking
   *  the frustum's left edge — see PhysicsBounds' own doc comment for why. */
  private computeBounds() {
    if (!this.camera) {
      return;
    }
    const distance = this.camera.position.z;
    const verticalFov = (this.camera.fov * Math.PI) / 180;
    const visibleHeight = 2 * Math.tan(verticalFov / 2) * distance;
    const visibleWidth = visibleHeight * this.camera.aspect;

    const margin = 0.5;
    this.bounds.maxX = visibleWidth / 2 - margin;
    this.bounds.minX = Math.min(1, this.bounds.maxX - 1);
    this.bounds.maxY = visibleHeight / 2 - margin;
    this.bounds.minY = -visibleHeight / 2 + margin;
  }

  private handlePointerDown(event: PointerEvent) {
    const crate = this.raycastCrate(event);
    if (!crate || !this.camera) {
      return;
    }
    event.preventDefault();

    crate.dragging = true;
    crate.velocity.set(0, 0);
    crate.dragSamples = [{ x: crate.mesh.position.x, y: crate.mesh.position.y, t: performance.now() }];
    this.draggingCrate = crate;

    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    this.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, crate.mesh.position);

    this.canvasRef.nativeElement.setPointerCapture(event.pointerId);
    this.canvasRef.nativeElement.style.cursor = 'grabbing';
  }

  private handlePointerMove(event: PointerEvent) {
    const canvas = this.canvasRef.nativeElement;
    if (!this.draggingCrate || !this.camera) {
      // Not dragging — just a hover check, so a visitor can tell the
      // crates are grabbable before actually clicking one.
      const hovering = !!this.raycastCrate(event);
      canvas.style.cursor = hovering ? 'grab' : '';
      return;
    }

    event.preventDefault();
    this.setPointerNdc(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
      this.draggingCrate.mesh.position.copy(this.dragPoint);
      const now = performance.now();
      this.draggingCrate.dragSamples.push({ x: this.dragPoint.x, y: this.dragPoint.y, t: now });
      // Trim to just the recent window used for the release-velocity
      // estimate below — an unbounded array would otherwise grow for as
      // long as a single drag lasts.
      this.draggingCrate.dragSamples = this.draggingCrate.dragSamples.filter(sample => now - sample.t <= DRAG_SAMPLE_WINDOW_MS);
    }
  }

  private handlePointerUp(event: PointerEvent) {
    const crate = this.draggingCrate;
    if (!crate) {
      return;
    }
    this.draggingCrate = null;
    crate.dragging = false;
    crate.thrown = true;

    const samples = crate.dragSamples;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedSeconds = first && last ? (last.t - first.t) / 1000 : 0;
    if (first && last && elapsedSeconds > 0) {
      const vx = (last.x - first.x) / elapsedSeconds;
      const vy = (last.y - first.y) / elapsedSeconds;
      const speed = Math.hypot(vx, vy);
      const scale = speed > MAX_THROW_SPEED ? MAX_THROW_SPEED / speed : 1;
      crate.velocity.set(vx * scale, vy * scale);
    }

    const canvas = this.canvasRef.nativeElement;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    canvas.style.cursor = '';
  }

  private setPointerNdc(event: PointerEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private raycastCrate(event: PointerEvent): FloatingCrate | null {
    if (!this.camera) {
      return null;
    }
    this.setPointerNdc(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const meshes = this.crates.map(crate => crate.mesh);
    const [hit] = this.raycaster.intersectObjects(meshes, false);
    if (!hit) {
      return null;
    }
    return this.crates.find(crate => crate.mesh === hit.object) ?? null;
  }

  /** Reads --mat-sys-primary/-tertiary off the live theme (see this class's
   *  own doc comment) and repaints every crate — called once at setup and
   *  again on every data-theme/data-mode attribute change. */
  private applyThemeColors() {
    const palette = [
      this.resolveThemeColor('--mat-sys-primary', '#6750a4'),
      this.resolveThemeColor('--mat-sys-tertiary', '#7d5260')
    ];
    for (const crate of this.crates) {
      crate.material.color.copy(palette[crate.paletteIndex]);
    }
    if (this.renderer && this.scene && this.camera && this.reducedMotion) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** styles.scss defines every --mat-sys-* token as a CSS light-dark(...)
   *  pair (see its own comment there) so one token can serve both color
   *  schemes without a separate copy per [data-mode] — but that also means
   *  reading it directly via getComputedStyle(host).getPropertyValue(...)
   *  hands back the *unresolved* "light-dark(#a, #b)" source text, not
   *  whichever side actually applies right now (custom properties aren't
   *  resolved against color-scheme the way an ordinary property's used
   *  value is). Assigning it to a real, inheritable property (color) on a
   *  throwaway element and reading *that* element's computed style forces
   *  the browser to actually pick a side, the same way any real use of the
   *  token elsewhere in this app's CSS already does. */
  private resolveThemeColor(varName: string, fallback: string): THREE.Color {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    probe.style.color = `var(${varName})`;
    this.hostRef.nativeElement.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return new THREE.Color(resolved || fallback);
  }

  private resizeToHost() {
    if (!this.renderer || !this.camera) {
      return;
    }
    const host = this.hostRef.nativeElement;
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.computeBounds();
    if (this.reducedMotion && this.scene) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

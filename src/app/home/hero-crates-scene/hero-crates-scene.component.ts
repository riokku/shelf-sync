import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import * as THREE from 'three';

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
}

/** Replaces Home's old flat CSS "glow blob" backdrop (see
 *  home.component.scss's own former home-hero-glow/-float) with a small
 *  three.js scene: a loose cluster of low-poly crates that slowly tumble
 *  and bob in place behind the "Welcome back" heading. Self-contained (owns
 *  its own renderer/animation loop/cleanup) so HomeComponent itself stays
 *  three.js-agnostic — it just drops this in where the old glow span used
 *  to sit.
 *
 *  Deliberately restrained rather than a full "3D hero" moment: this is a
 *  utility dashboard someone lands on every session, not a marketing page,
 *  so the cluster is muted (transparent, low-opacity materials), biased
 *  toward the right/lower part of the frame (away from the left-aligned
 *  heading text it sits behind), and capped at a modest device-pixel-ratio
 *  and polygon count — a handful of boxes, no textures, no shadows, no
 *  post-processing.
 *
 *  Colors are read from the live theme's own --mat-sys-primary/-tertiary
 *  tokens (same "recolors itself per-organization" convention the old glow
 *  and landing's own hero gradient already use), re-read whenever the
 *  <html> element's data-theme/data-mode attributes change (site color
 *  preset or light/dark toggle) — unlike a plain CSS gradient, three.js
 *  bakes color into JS state at creation time, so it needs its own
 *  MutationObserver to stay in sync with a theme change made without
 *  leaving this page. */
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

  ngAfterViewInit() {
    // The whole scene — renderer, rAF loop, ResizeObserver/MutationObserver
    // callbacks — runs outside Angular's zone: none of it ever touches a
    // template binding, so there's nothing here that needs change
    // detection. Left inside the zone, zone.js's own requestAnimationFrame
    // patch keeps the app permanently "unstable" (a recursive rAF loop
    // never lets NgZone go idle), which breaks anything that waits on
    // stability — ApplicationRef.isStable, fixture.whenStable() in tests
    // (this is what surfaced it: every HomeComponent spec hung until
    // Jasmine's own timeout), etc.
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
        )
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

    const animate = () => {
      const delta = this.clock.getDelta();
      const elapsed = this.clock.elapsedTime;
      for (const crate of this.crates) {
        crate.mesh.rotation.x += crate.spinSpeed.x * delta;
        crate.mesh.rotation.y += crate.spinSpeed.y * delta;
        crate.mesh.rotation.z += crate.spinSpeed.z * delta;
        crate.mesh.position.y = crate.baseY + Math.sin(elapsed * crate.bobSpeed + crate.bobOffset) * crate.bobAmplitude;
      }
      renderer.render(scene, camera);
      this.frameId = requestAnimationFrame(animate);
    };
    animate();
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
    if (this.reducedMotion && this.scene) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

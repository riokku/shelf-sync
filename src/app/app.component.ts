import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PrimeNGConfig } from 'primeng/api';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit{
  title = 'ShelfSync';

  constructor(
    private primengConfig: PrimeNGConfig,
    public router: Router
  ){}

  ngOnInit(): void {
    this.primengConfig.ripple = true;
  }

}

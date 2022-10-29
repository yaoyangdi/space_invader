import { fromEvent, interval, Observable, of} from 'rxjs';
import {map, filter, takeUntil, scan, merge} from 'rxjs/operators';

function spaceinvaders() {
    // Inside this function you will use the classes and functions 
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable exampels first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code! 

    // Types 
    type Key = 'ArrowLeft' | 'ArrowRight' | 'Space' | 'Enter'
    type Event = 'keydown' | 'keyup'
    type ViewType = 'ship' | 'shipBullet' | 'alien' | 'alienBullet' | 'shield' // our game has the following view element types:
    type Body = { viewType: ViewType,         // our each game elements is as Body type with several properties
                  id: string,
                  x: number,
                  y: number,
                  vel: number,
                  radius:number
                  }
    type State = Readonly<{       // Game state
      ship:Body,
      shipBullets:ReadonlyArray<Body>,
      aliens:ReadonlyArray<Body>,
      alienBullets: ReadonlyArray<Body>
      shields:   ReadonlyArray<Body>
      objCount:number,
      exit: ReadonlyArray<Body>,
      gameOver: boolean,
      score: number,
      level: number,
      nextLevel: boolean
    }>
    
    // Classes that define the actions took in the game
    class Move{constructor(public readonly x_movement:number){} }
    class Shoot{constructor(){} }
    class Tick{constructor(){}}
    class AlienShoot{constructor(){}}
    class Restart{constructor(){}}

    // Constant value for difinition of game elements 
    const Constants = {     
      CanvasSize: 600,

      // Ship Constants
      ShipWidth: 50,
      ShipHeight: 20,
      ShipVelocity: 10,

      // Bullets Constants
      BulletRadius: 4,
      ShipBulletVelocity: -15,
      AlienBulletVelocity: 6,
  
      // Aliens Constants
      AlienRadius: 18,
      AlienDownMovement: 25,
      StartAlienCount: 21,
      AlienVelocity: 1.5,

      // Shield Constants
      ShieldCount: 80,
      ShieldRadius: 19
    };
  



  // Below functions are to create elements
    // Ship
    function createShip():Body {
      return {
        viewType: 'ship',
        id: 'ship',
        x: 300,
        y: 580,
        vel: 0,
        radius:10
      }
    }

    // Aliens, Bullets and Shield
    // all aliens, bullets and shields are simply circle 
    const createCircle = (viewType: ViewType) => (id:string) => (x: number) => (y: number)=>
    <Body>{ 
      viewType: viewType,
      id: viewType+id,
      x: x,
      y: y,
      vel:  (viewType==='alienBullet') ? Constants.AlienBulletVelocity 
          : (viewType==='shipBullet') ? Constants.ShipBulletVelocity 
          : (viewType==='alien') ? Constants.AlienVelocity
          : 0,

      radius: (viewType==="alienBullet"||viewType==="shipBullet") ? Constants.BulletRadius 
            : (viewType==="shield") ? Constants.ShieldRadius
            : Constants.AlienRadius
    },
    createAlien = createCircle('alien'),
    createShipBullet = createCircle('shipBullet'),
    createAlienBullet = createCircle('alienBullet'),
    createShield = createCircle('shield');


  // Below functions are to initialize elements in the game
    // Shields
    const startShields = 
    [...Array(Constants.ShieldCount)]
    .map((item, index) => (index >= 0 && index <20) ? createShield(String(index))(index%4*150+index%5*15+40)(420)
                    :  (index >= 20 && index < 40 ) ? createShield(String(index))(index%4*150+index%5*15+40)(435)
                    :  (index >= 40 && index < 60 ) ? createShield(String(index))(index%4*135+index%8*15+40)(450)
                    :   createShield(String(index))(index%4*135+index%8*15+40)(459));
    // Aliens
    const startAliens = 
          [...Array(Constants.StartAlienCount)]
    .map((item, index)=> (index >= 0 && index < 7)  ? createAlien(String(index))(index*60+30)(80)
                      : (index >= 7 && index < 14) ? createAlien(String(index))(index*60-390)(130)
                      : createAlien(String(index))(index*60-810)(180));


// Configuration on the whole game
  //  Initialize the state of game
    const initialState:State = {
      ship: createShip(),
      shipBullets: [],
      aliens: startAliens,
      alienBullets:[],
      shields: startShields,
      objCount: 0,
      exit: [],
      gameOver: false,
      score: 0,
      level: 1,
      nextLevel: false
    };

    const observeKey = <T>(eventName:Event, k:Key, result:()=>T)=> 
    fromEvent<KeyboardEvent>(document,eventName).pipe(
        filter(({code})=>code === k),
        filter(({repeat})=>!repeat),
        map(result)
        );
   
  
          // interval base stream
    const alienShoot$ = interval(400).pipe(map(_=>new AlienShoot())),
          // User input driven stream
          moveLeft$ = observeKey('keydown','ArrowLeft',()=>new Move(-1*Constants.ShipVelocity)),
          stopMoveLeft$ = observeKey('keyup','ArrowLeft',()=>new Move(0)),
          moveRight$= observeKey('keydown', 'ArrowRight', ()=>new Move(Constants.ShipVelocity)),
          stopMoveRight$ = observeKey('keyup','ArrowRight',()=>new Move(0)),
          restart$ = observeKey('keydown', 'Enter', ()=>new Restart()),
          shoot$ = observeKey('keydown','Space', ()=>new Shoot());
          
    
    // handle collisions by checking collision 
    //                      cleaning expired Bodies(colliedBullets, colliedAliens...), 
    //                      check game is over or not
    //                      check need to increase level or not
    const handleCollisions = (s:State) => {
      const
        CollidedWithCircles = ([a,b]:[Body,Body]) => distance({ x1: a.x, y1: a.y })({ x2: b.x, y2: b.y }) <= a.radius+b.radius,
        CollidedWithShip = ([a,ship]:[Body,Body]) => (Math.abs(a.x-ship.x)<=Constants.ShipWidth/2+a.radius)&&(Math.abs(a.y-ship.y)<=Constants.ShipHeight/2+a.radius),

        // collisions with Ship and bullets
        shipCollided = (s.alienBullets.filter((b:Body)=>CollidedWithShip([b, s.ship])).length>0) ||
                       (s.aliens.filter((b:Body)=>CollidedWithShip([b, s.ship])).length>0),
        
        // collisions with aliens and bullets
        allBulletsAndAliens = flatMap(s.shipBullets, b=> s.aliens.map<[Body,Body]>(r=>([b,r]))),
        collidedBulletsAndAliens = allBulletsAndAliens.filter(CollidedWithCircles),
        collidedShipBullets = collidedBulletsAndAliens.map(([bullet,_])=>bullet),
        collidedAliens_forBullets = collidedBulletsAndAliens.map(([_,alien])=>alien),

        // collisions with shield and bullets
        allBulletsAndShield = flatMap(s.alienBullets, b=> s.shields.map<[Body,Body]>(r=>([b,r]))),
        collidedBulletsAndShield = allBulletsAndShield.filter(CollidedWithCircles),
        collidedAlienBullets = collidedBulletsAndShield.map(([bullet,_])=>bullet),
        collidedShield_forBullets = collidedBulletsAndShield.map(([_,shield])=>shield),

        cut = except((a:Body)=>(b:Body)=>a.id === b.id); //Exclude elements of b in a



        // Addition feature: If alien go down to the button, the game is over
        const isAtButton = (b:Body) => ((b.y)>=Constants.CanvasSize-b.radius); // filter function
        const alienGoBotton = s.aliens.filter(isAtButton).length>0; // whether or not the alien go down to button
        
        // Feature of Full game: The game progresses to a new level after all aliens are shot
        const levelUp = s.aliens.length ===0; // whether or not we need to increase the level since all aliens were cleaned 
        
        return <State>{
          ...s,
          shipBullets: cut(s.shipBullets)(collidedShipBullets),
          aliens: cut(s.aliens)(collidedAliens_forBullets),
          alienBullets: cut(s.alienBullets)(collidedAlienBullets),
          shields: cut(s.shields)(collidedShield_forBullets),
          exit: s.exit.concat(collidedShipBullets,
                              collidedAlienBullets,
                              collidedAliens_forBullets,
                              collidedShield_forBullets),
          gameOver: alienGoBotton || shipCollided,
          score: s.score + collidedShipBullets.length*10,
          level: levelUp? s.level+1 : s.level,
          nextLevel: levelUp
        }
    }

    // Wrap a positions around edges of the screen
    const torusWrap = (x:number) => { 
    const s=Constants.CanvasSize, 
    wrap = (pos:number) => (pos<0) ? pos + s : (pos>s) ? pos - s : pos;
    return wrap(x);
    }

  // Move elements by updating their position

    // Move the ship so that it enables ship goes out of bound to the opposite side of screen
    function moveShip(s:State): Body {
      return {
        ...s.ship, 
        x: torusWrap(s.ship.x + s.ship.vel) 
      }
    }
    // Ship bullets and Alien Bullets
    function moveBullet(b: Body): Body {
      return {
        ...b,
        y: b.y + b.vel
      }
    }
    // Aliens
    function moveAliens(s:State):Body[] {

      // Addition feature: alien will speed up when the size of aliens army is decreasing
      const velocity_level = s.aliens.length >10 ? Constants.AlienVelocity*s.level : s.aliens.length>5 ? Constants.AlienVelocity*s.level*1.5 : Constants.AlienVelocity*s.level*1.75; 
      const isOutOfBound = (b:Body)=> ((b.x)<Constants.AlienRadius || (b.x)>(Constants.CanvasSize-Constants.AlienRadius))
      const aliensOutOfBound = s.aliens.filter(isOutOfBound).length>0;

      // the inside function to move each aliens
      // change their move direction and move downwards when they are going out of bound
      function moveEachAliens(b:Body):Body {
        ;
        const vel_level = b.vel>0 ? velocity_level : (-1)* velocity_level;
        const vel = aliensOutOfBound ? (-1)* vel_level : vel_level;
        return {...b,
          vel: vel,

          // when the alien is out of bound, it need to change the direction of movement and going down 
          x:   aliensOutOfBound ? b.vel * (-1) + b.x
                            : b.vel + b.x,

          y:   aliensOutOfBound ? Constants.AlienDownMovement + b.y
                            : b.y
        }
      }
      return s.aliens.map(moveEachAliens);
    }


    // Function that handles all interspersed events which correspond to user interaction with the system
    // main logic: 1. move Body  2.handle expired Body  3. handle bodies collision 
    const tick = (s:State) => {
      const not = <T>(f: (x: T) => boolean) => (x: T) => !f(x);
      const 
        shipBullets_isExpired = (b: Body) => (b.y) <= 0,
        expiredShipBullets: Body[] = s.shipBullets.filter(shipBullets_isExpired),
        activeShipBullets = s.shipBullets.filter(not(shipBullets_isExpired));
    
      const
        alienBullets_isExpired = (b: Body) => (b.y) >= 600,
        expiredAlienBullets: Body[] = s.alienBullets.filter(alienBullets_isExpired),
        actveAlienBullets = s.alienBullets.filter(not(alienBullets_isExpired));

        return handleCollisions({...s,
          ship:moveShip(s), 
          shipBullets: activeShipBullets.map(moveBullet),
          aliens: moveAliens(s),
          alienBullets: actveAlienBullets.map(moveBullet),
          exit: s.exit.concat(expiredShipBullets, expiredAlienBullets)
        })
      };
      
    const selectAlienToShot= (s:State):Body => s.aliens[Math.floor(Math.random()*s.aliens.length)];

    // state transform and reduce
    const reduceState = (s:State, e:Move|Shoot|Tick|AlienShoot|Restart)=>{
      if (e instanceof Restart) return {
        ...initialState,
        exit:s.alienBullets.concat(s.shipBullets),
       }
      if (s.gameOver) return s;
      if (s.nextLevel) return  {
        ...initialState,
        level: s.level,
        score: s.score,
        exit:s.alienBullets.concat(s.shipBullets),
      }

       return e instanceof Move ? {
        ...s,
        ship:{...s.ship, vel:e.x_movement}
       }

       : e instanceof Shoot ? {
        ...s,
        shipBullets: (s.shipBullets).concat([createShipBullet(String(s.objCount))(s.ship.x)(s.ship.y)]),
        objCount: s.objCount + 1
       }

       : e instanceof Tick ? tick(s) 

       : {
         ...s,
         alienBullets: (s.alienBullets).concat([createAlienBullet(String(s.objCount))(selectAlienToShot(s).x)(selectAlienToShot(s).y)]),
         objCount: s.objCount + 1
       } 
    }
    
    const subscription = interval(30).pipe(
      map((_:number)=>new Tick()),
      merge(moveLeft$, stopMoveLeft$, moveRight$, stopMoveRight$, shoot$, alienShoot$, restart$),
      scan(reduceState, initialState))
      .subscribe(updateView);
    
  
    function updateView(s:State) {  
      // Retrieve elements that are defined in html file
      const svg = document.getElementById("canvas")!;
      const ship = document.getElementById("ship")!;
      const gameOver = document.getElementById("gameover")!;
      const score = document.getElementById("score")!;
      const level = document.getElementById("level")!;

      ship.setAttribute('transform', `translate(${s.ship.x}, ${s.ship.y})`); // update ship
      gameOver.classList.add('hidden');             // hide the text element when the game is not over
      score.textContent = `Score: ${s.score}`;      // update score
      level.textContent = `Level: ${s.level}`;      // update level

  
      const setFill = (viewType: ViewType) => viewType=== "alien" ? "white"
      : viewType === "alienBullet" ? "#002fff" 
      : viewType === "shipBullet"|| "shield"  ? "#00f114" 
      : "white";

      // function to update each element's attribute
      const updateBodyView = (b:Body) => {  
        function createBodyView() {
          const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
          attr(v,{id:b.id,rx:b.radius,ry:b.radius});
          v.setAttribute("fill", setFill(b.viewType));
          v.classList.add(b.id)
          svg.appendChild(v)
          return v;
        }
        const v = document.getElementById(b.id) || createBodyView();
        attr(v, { cx: b.x, cy: b.y });
      };

      
      // If game is over
      if (s.gameOver) {
        gameOver.classList.remove('hidden'); // the "game over" text will be visible
      }
      // update each elements
      s.shipBullets.forEach(updateBodyView);
      s.alienBullets.forEach(updateBodyView);
      s.aliens.forEach(updateBodyView);
      s.shields.forEach(updateBodyView);

      // remove elements that no longer exist
      s.exit.forEach(o => {
        const v = document.getElementById(o.id);
        if (v) svg.removeChild(v)
      })

      }
  }
  
  // Now run our space invader game
  if (typeof window != 'undefined')
    window.onload = ()=>{
      spaceinvaders();
    }
  
 // set a set of attributions for an document element by given objects
 function attr(e:Element,o:Object) {
  of(
    ...Object.entries(o)
  ).subscribe(([key, val]) => e.setAttribute(key, String(val)));
  }

 // Calculate the distance between 2 coordinates (x1,y1) and (x2, y2)
 const distance = ({x1, y1}: {x1:number, y1:number}) =>  ({x2, y2}: {x2:number, y2:number}) =>  
 Math.sqrt((x1-x2)**2+(y1-y2)**2)


 // Below functions derived from the Asteroids example code
 const except = 
 <T>(eq: (_:T)=>(_:T)=>boolean)=>
   (a:ReadonlyArray<T>)=> 
     (b:ReadonlyArray<T>)=> a.filter(not(elem(eq)(b)))

 const not = <T>(f: (x: T) => boolean) => (x: T) => !f(x)

 const elem = 
  <T>(eq: (_:T)=>(_:T)=>boolean)=> 
    (a:ReadonlyArray<T>)=> 
      (e:T)=> a.findIndex(eq(e)) >= 0

 function flatMap<T,U>(
  a:ReadonlyArray<T>,
  f:(a:T)=>ReadonlyArray<U>) 
  : ReadonlyArray<U> {
  return Array.prototype.concat(...a.map(f));
}

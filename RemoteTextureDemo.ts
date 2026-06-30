import { Async } from "./Yuu API/Async";
import { Color } from "./Yuu API/Basic Types/Color";
import { Controller } from "./Yuu API/Controller";
import { Quaternion } from "./Yuu API/Basic Types/Quaternion";
import { Vector3 } from "./Yuu API/Basic Types/Vector3";
import { inWorldConsole } from "./Yuu API/Console";
import { Entity } from "./Yuu API/Entity";
import { registerStart } from "./Yuu API/RegisterStart";
import { applyRemoteTexture, fetchManifest, TextureManifestEntry } from "./Yuu API/RemoteTexture";
import { spawnPrimitive } from "./Yuu API/SpawnPrimitive";


/**
 * RemoteTexture demo - cycle through server textures on a cube.
 * =============================================================
 *  - Loads the list of textures from the server (everything in TextureServer/sources).
 *  - Applies the first one to the cube on load.
 *  - RIGHT A  = next texture,  RIGHT B = previous texture.
 *
 * Add images to TextureServer/sources, RESTART serve.py (the tunnel can stay up), and
 * they show up here automatically. Forces the JSON tier (/tex/<id>.json), the proven path.
 */

const TEXTURE_HOST = 'october-explained-teaches-yale.trycloudflare.com'; // update if cloudflared restarted

let cube: Entity | undefined;
let textures: TextureManifestEntry[] = [];
let current = 0;
let busy = false; // ignore presses while a texture is being applied


registerStart(start);

function start() {
  inWorldConsole.visible(true, new Vector3(0, 2, -2));

  cube = spawnPrimitive.cube(
    new Vector3(-1.3, 1.4, -1.4),
    new Vector3(0.5, 0.5, 0.5),
    Quaternion.one,
    new Color(1, 1, 1),
    1,
    true,
    'Static',
    undefined,
  );

  Controller.subscribe('rightA', 'Pressed', () => { cycle(1); });
  Controller.subscribe('rightB', 'Pressed', () => { cycle(-1); });

  // Fetch the texture list shortly after load (keeps the blocking call off the load frame).
  Async.setTimeout(loadList, 500);
}

function loadList() {
  textures = fetchManifest(TEXTURE_HOST);
  console.log('RemoteTexture: ' + textures.length + ' texture(s). RIGHT A = next, RIGHT B = previous.');

  if (textures.length > 0) {
    applyCurrent();
  }
  else {
    console.log('RemoteTexture: no textures found (is serve.py running with images in sources/?).');
  }
}

function cycle(direction: number) {
  if (busy || textures.length === 0) { return; }
  current = (current + direction + textures.length) % textures.length;
  applyCurrent();
}

function applyCurrent() {
  if (!cube || textures.length === 0) { return; }

  const entry = textures[current];
  const path = '/tex/' + entry.id + '.json'; // force the JSON tier

  busy = true;
  console.log('RemoteTexture: applying ' + entry.id + ' (' + (current + 1) + '/' + textures.length + ')');

  applyRemoteTexture(cube, TEXTURE_HOST, path, { useMipMaps: false })
    .then(() => { busy = false; console.log('RemoteTexture: showing ' + entry.id); })
    .catch((e) => { busy = false; console.log('RemoteTexture: ' + e); });
}

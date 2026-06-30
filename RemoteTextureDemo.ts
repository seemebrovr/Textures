import { Async } from "./Yuu API/Async";
import { Color } from "./Yuu API/Basic Types/Color";
import { Quaternion } from "./Yuu API/Basic Types/Quaternion";
import { Vector2 } from "./Yuu API/Basic Types/Vector2";
import { Vector3 } from "./Yuu API/Basic Types/Vector3";
import { inWorldConsole } from "./Yuu API/Console";
import { Entity } from "./Yuu API/Entity";
import { http } from "./Yuu API/Networking/http";
import { registerStart } from "./Yuu API/RegisterStart";
import { applyRemoteTexture, fetchManifest } from "./Yuu API/RemoteTexture";
import { spawnPrimitive } from "./Yuu API/SpawnPrimitive";
import { Texture } from "./Yuu API/Texture";


/**
 * RemoteTexture DIAGNOSTIC v2
 * ===========================
 * Stage 6 (fill+apply) and stage 8 (network) already PASSED. This isolates the remaining
 * suspects with pauses + numbered logs. Whatever the LAST "[RT] N" line is = the culprit.
 *
 *   6a-6c  setPixelsColor PROBE on a local texture (NO network) - the prime suspect
 *   8a-8b  fetch the brick payload by itself (getJson only, NO texture build)
 *   9-10   the full applyRemoteTexture path
 */

const TEXTURE_HOST = 'describing-conservation-refer-johns.trycloudflare.com'; // update if cloudflared restarted
const TEXTURE_PATH = '/tex/brick_01.json';

function log(msg: string) { console.log('[RT] ' + msg); }

let cube: Entity | undefined;


registerStart(start);

function start() {
  inWorldConsole.visible(true, new Vector3(0, 2, -2));
  log('0 world loaded');

  // Off to the LEFT so it doesn't block the console.
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
  log('1 cube spawned');

  Async.setTimeout(stageSetPixelsProbe, 2000);
}


// PROBE: does Godot.image.setPixelsColor crash? Local only, no network, no decode.
function stageSetPixelsProbe() {
  if (!cube) { return; }

  log('6a setPixelsColor probe: build 1024 coords');
  const tex = new Texture(64, 64);
  tex.fillWithColor(new Color(0.2, 0.5, 1), 1); // blue base

  const coords: Vector2[] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      coords.push(new Vector2(x, y)); // a 32x32 = 1024 px block, all in-bounds
    }
  }
  log('6b calling setPixelsColor with ' + coords.length + ' px');
  tex.setPixelsColor(coords, new Color(1, 0.2, 0.2), 1); // red block
  tex.updateTexture();
  cube.mesh.texture.set(tex, false);
  log('6c probe ok -> cube blue with a RED corner');

  Async.setTimeout(stageManifest, 3000);
}


function stageManifest() {
  log('7 fetching manifest...');
  const manifest = fetchManifest(TEXTURE_HOST);
  log('8 manifest ok: ' + manifest.length + ' texture(s)');

  Async.setTimeout(stagePayloadOnly, 3000);
}


// Fetch the brick payload by itself - tests getJson on the larger object, no texture build.
function stagePayloadOnly() {
  log('8a fetching payload (getJson only)...');
  const p = http.getJson<{ w: number; h: number; paletteCount: number; encoding: string; pixels: string }>(TEXTURE_HOST, TEXTURE_PATH);
  if (!p) {
    log('8b payload UNDEFINED (fetch returned nothing)');
  }
  else {
    log('8b payload ok: ' + p.w + 'x' + p.h + ' pal=' + p.paletteCount + ' enc=' + p.encoding + ' pixlen=' + (p.pixels ? p.pixels.length : 0));
  }

  Async.setTimeout(stageRemote, 3000);
}


function stageRemote() {
  if (!cube) { return; }

  log('9 applying remote texture...');
  applyRemoteTexture(cube, TEXTURE_HOST, TEXTURE_PATH, { useMipMaps: false, pixelsPerFrame: 1024 })
    .then(() => { log('10 remote applied -> cube should be BRICK'); })
    .catch((e) => { log('ERR ' + e); });
}

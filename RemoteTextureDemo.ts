import { Async } from "./Yuu API/Async";
import { Color } from "./Yuu API/Basic Types/Color";
import { Quaternion } from "./Yuu API/Basic Types/Quaternion";
import { Vector3 } from "./Yuu API/Basic Types/Vector3";
import { inWorldConsole } from "./Yuu API/Console";
import { Entity } from "./Yuu API/Entity";
import { registerStart } from "./Yuu API/RegisterStart";
import { applyRemoteTexture } from "./Yuu API/RemoteTexture";
import { spawnPrimitive } from "./Yuu API/SpawnPrimitive";


/**
 * RemoteTexture DIAGNOSTIC v3
 * ===========================
 * setPixelsColor and the payload fetch already PASSED in isolation. This goes straight
 * to the full applyRemoteTexture path, which has internal checkpoint logs (L1..L8 in
 * RemoteTexture.ts). The last "[RT] L#" line before a crash is the exact failing step.
 */

const TEXTURE_HOST = 'october-explained-teaches-yale.trycloudflare.com'; // update if cloudflared restarted
const TEXTURE_PATH = '/tex/brick_01.json';

let cube: Entity | undefined;


registerStart(start);

function start() {
  inWorldConsole.visible(true, new Vector3(0, 2, -2));
  console.log('[RT] 0 world loaded');

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
  console.log('[RT] 1 cube spawned');

  Async.setTimeout(go, 2000);
}

function go() {
  if (!cube) { return; }

  console.log('[RT] 9 applyRemoteTexture (watch L1..L8)');
  applyRemoteTexture(cube, TEXTURE_HOST, TEXTURE_PATH, { useMipMaps: false, pixelsPerFrame: 1024 })
    .then(() => { console.log('[RT] DONE -> cube should be BRICK'); })
    .catch((e) => { console.log('[RT] ERR ' + e); });
}

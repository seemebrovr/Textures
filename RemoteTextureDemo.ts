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
 * RemoteTexture demo
 * ==================
 * Spawns a cube and applies a server-converted texture to it.
 *
 *  - TEXTURE_HOST : host of your conversion server (here, a Cloudflare quick tunnel; this
 *                   URL changes every time cloudflared restarts, so update it then).
 *  - TEXTURE_PATH : '/tex/<id>.json' for the JSON tier, or '/tex/<id>.zip' for the zip tier.
 *
 * The apply is deferred briefly so no blocking network call happens on the load frame.
 */

const TEXTURE_HOST = 'october-explained-teaches-yale.trycloudflare.com';
const TEXTURE_PATH = '/tex/brick_01.json';

let cube: Entity | undefined;


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

  Async.setTimeout(applyTexture, 500);
}

function applyTexture() {
  if (!cube) { return; }

  applyRemoteTexture(cube, TEXTURE_HOST, TEXTURE_PATH, { useMipMaps: false })
    .then(() => { console.log('RemoteTexture: applied ' + TEXTURE_PATH); })
    .catch((e) => { console.log('RemoteTexture: ' + e); });
}

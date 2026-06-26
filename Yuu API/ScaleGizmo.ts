import { Color } from "./Basic Types/Color";
import { Quaternion } from "./Basic Types/Quaternion";
import { Vector3 } from "./Basic Types/Vector3";
import { Controller } from "./Controller";
import { Entity } from "./Entity";
import { Events } from "./Events";
import { grabbable, Hand } from "./Grabbable";
import { Player } from "./Player";
import { propertyPanel } from "./PropertyPanel";
import { registerStart } from "./RegisterStart";
import { spawnPrimitive } from "./SpawnPrimitive";


// ============================================================================
// ScaleGizmo - per-axis, one-sided resize handles for an entity.
// ----------------------------------------------------------------------------
// SELECT the entity (point your pointer ray at it and pull the trigger) and six
// colored handles appear, one on each face:
//     +X / -X = red,   +Y / -Y = green,   +Z / -Z = blue
// (the brighter handle of each pair points in the positive direction).
//
// Grab a handle (grip) and pull: ONLY that face moves - the opposite face stays
// anchored in place, so you resize one side at a time and the object can become
// any box shape. Pull the trigger on the object again to deselect.
//
// Scaling happens while the object is selected and NOT held (it pins the object
// for the duration of the drag).
// ============================================================================


type Handle = {
  entity: Entity,
  localDir: Vector3,  // unit direction in the object's local space
  axisIndex: number,  // 0 = X, 1 = Y, 2 = Z
}

type GizmoOptions = {
  /** Called with the new scale whenever the object is resized. */
  onScale?: (scale: Vector3) => void,
}

type GizmoState = {
  target: Entity,
  handles: Handle[],
  options: GizmoOptions,
  selected: boolean,
}


const gizmos: GizmoState[] = [];

const handleSize = 0.05;        // size of each handle cube (meters)
const handleGap = 0.12;         // how far beyond a face a handle floats
const handleGrabRadius = 0.08;  // how close a hand must be to grab a handle
const minSize = 0.05;
const maxSize = 1.5;


type Drag = {
  gizmo: GizmoState,
  hand: Hand,
  axisIndex: number,
  axisDir: Vector3,    // world direction of the grabbed face (fixed during the drag)
  anchor: Vector3,     // world center of the opposite (fixed) face
  grabOffset: number,  // distance from the grabbed face to the hand, along axisDir
  startScale: Vector3, // object scale at grab time
  rot: Quaternion,     // object rotation, held fixed during the drag
}

let drag: Drag | undefined;


export const scaleGizmo = {
  attach,
};


/**
 * Add per-axis resize handles to an entity. The handles appear when the entity is
 * selected (pointer ray + trigger), and let you drag one face at a time.
 * @param target the entity to resize
 * @param options optional onScale callback (e.g. to keep grab points in sync)
 */
function attach(target: Entity, options: GizmoOptions = {}): void {
  const handles: Handle[] = [
    { entity: makeHandle(new Color(0.9, 0.15, 0.15)), localDir: new Vector3(1, 0, 0), axisIndex: 0 },
    { entity: makeHandle(new Color(0.45, 0.08, 0.08)), localDir: new Vector3(-1, 0, 0), axisIndex: 0 },
    { entity: makeHandle(new Color(0.2, 0.8, 0.2)), localDir: new Vector3(0, 1, 0), axisIndex: 1 },
    { entity: makeHandle(new Color(0.08, 0.4, 0.08)), localDir: new Vector3(0, -1, 0), axisIndex: 1 },
    { entity: makeHandle(new Color(0.25, 0.5, 1)), localDir: new Vector3(0, 0, 1), axisIndex: 2 },
    { entity: makeHandle(new Color(0.1, 0.2, 0.55)), localDir: new Vector3(0, 0, -1), axisIndex: 2 },
  ];

  const gizmo: GizmoState = {
    target: target,
    handles: handles,
    options: options,
    selected: false,
  };

  gizmos.push(gizmo);

  // Selecting: point at the object and pull the trigger to toggle the handles.
  target.rayClick.initialize(false);
  target.rayClick.setClickFunction(() => {
    gizmo.selected = !gizmo.selected;
  });
}


function makeHandle(color: Color): Entity {
  const handle = spawnPrimitive.cube(
    new Vector3(0, -100, 0), // parked out of sight until shown
    new Vector3(handleSize, handleSize, handleSize),
    Quaternion.one,
    color,
    1,
    false,   // no collider - detected by proximity
    'Empty', // no physics
    undefined
  );

  handle.visible.set(false);

  return handle;
}


function axisComponent(v: Vector3, i: number): number {
  return i === 0 ? v.x : (i === 1 ? v.y : v.z);
}

function withAxis(v: Vector3, i: number, value: number): Vector3 {
  return new Vector3(
    i === 0 ? value : v.x,
    i === 1 ? value : v.y,
    i === 2 ? value : v.z,
  );
}


function setHandlesVisible(gizmo: GizmoState, visible: boolean): void {
  gizmo.handles.forEach((handle) => handle.entity.visible.set(visible));
}

function updateHandles(gizmo: GizmoState): void {
  const center = gizmo.target.pos;
  const rot = gizmo.target.rot;
  const scale = gizmo.target.scale;

  gizmo.handles.forEach((handle) => {
    const worldDir = rot.rotateVector(handle.localDir);
    const halfAxis = axisComponent(scale, handle.axisIndex) / 2;

    handle.entity.pos = center.add(worldDir.multiply(halfAxis + handleGap));
    handle.entity.rot = rot;
  });
}


function handPos(hand: Hand): Vector3 | undefined {
  return hand === 'Left' ? Player.leftHand.position.get() : Player.rightHand.position.get();
}

function nearestHandle(gizmo: GizmoState, pos: Vector3): Handle | undefined {
  let nearest: Handle | undefined;
  let nearestDist = handleGrabRadius;

  gizmo.handles.forEach((handle) => {
    const dist = handle.entity.pos.distanceTo(pos);

    if (dist <= nearestDist) {
      nearest = handle;
      nearestDist = dist;
    }
  });

  return nearest;
}


function tryStartDrag(hand: Hand): void {
  if (drag) {
    return;
  }

  const pos = handPos(hand);

  if (!pos) {
    return;
  }

  for (const gizmo of gizmos) {
    // Only a selected object that isn't currently held can be resized.
    if (!gizmo.selected || !gizmo.target.exists() || grabbable.isHeld(gizmo.target)) {
      continue;
    }

    const handle = nearestHandle(gizmo, pos);

    if (!handle) {
      continue;
    }

    const rot = gizmo.target.rot;
    const center = gizmo.target.pos;
    const scale = gizmo.target.scale;

    const axisDir = rot.rotateVector(handle.localDir);
    const sizeAxis = axisComponent(scale, handle.axisIndex);

    // The opposite face is the fixed anchor; the grabbed face tracks the hand.
    const anchor = center.subtract(axisDir.multiply(sizeAxis / 2));
    const grabOffset = pos.subtract(anchor).dot(axisDir) - sizeAxis;

    drag = {
      gizmo: gizmo,
      hand: hand,
      axisIndex: handle.axisIndex,
      axisDir: axisDir,
      anchor: anchor,
      grabOffset: grabOffset,
      startScale: scale,
      rot: rot,
    };

    return;
  }
}

function stopDrag(hand: Hand): void {
  if (drag && drag.hand === hand) {
    drag = undefined;
  }
}


registerStart(start);
function start() {
  Events.onPhysicsUpdate(onPhysicsUpdate);

  Controller.subscribe('leftGrip', 'Pressed', () => tryStartDrag('Left'));
  Controller.subscribe('leftGrip', 'Released', () => stopDrag('Left'));
  Controller.subscribe('rightGrip', 'Pressed', () => tryStartDrag('Right'));
  Controller.subscribe('rightGrip', 'Released', () => stopDrag('Right'));
}

function onPhysicsUpdate(deltaTime: number) {
  // Show + position handles for selected objects; hide the rest.
  gizmos.forEach((gizmo) => {
    const show = gizmo.selected && gizmo.target.exists();

    setHandlesVisible(gizmo, show);

    if (show) {
      updateHandles(gizmo);
    }
  });

  // Apply an active one-sided scale drag.
  if (drag) {
    const target = drag.gizmo.target;

    if (!target.exists() || !drag.gizmo.selected) {
      drag = undefined;
      return;
    }

    const pos = handPos(drag.hand);

    if (!pos) {
      return;
    }

    // How far the hand is from the fixed anchor face, along the drag axis.
    const projection = pos.subtract(drag.anchor).dot(drag.axisDir);

    let newSizeAxis = projection - drag.grabOffset;
    newSizeAxis = Math.max(minSize, Math.min(maxSize, newSizeAxis));

    const newScale = withAxis(drag.startScale, drag.axisIndex, newSizeAxis);
    const newCenter = drag.anchor.add(drag.axisDir.multiply(newSizeAxis / 2));

    target.scale = newScale;
    target.pos = newCenter;
    target.rot = drag.rot;          // keep orientation fixed while resizing
    target.velocity.set(Vector3.zero);

    // Keep the physics-off freeze in sync so it doesn't snap the object back.
    propertyPanel.setFrozenPose(target, newCenter, drag.rot);

    drag.gizmo.options.onScale?.(newScale);
  }
}

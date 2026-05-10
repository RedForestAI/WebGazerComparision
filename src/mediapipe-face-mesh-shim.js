// Shim for @mediapipe/face_mesh — the real face_mesh.js is loaded
// via a script tag and sets FaceMesh on the global window object.
export const FaceMesh = window.FaceMesh;
export default { FaceMesh: window.FaceMesh };

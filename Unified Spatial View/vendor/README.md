# Vendored dependency

Three.js **0.180.0**, unmodified files from the official `three` npm package. Runtime imports resolve locally through index.html's import map. No CDN, React or bundler is used.

Included: three.module.js, its three.core.js dependency, GLTFLoader, OrbitControls, SkeletonUtils, BufferGeometryUtils and MIT LICENSE. SHA256SUMS.json records the shipped files. package-lock.json pins npm integrity for reproducibility. The npm installation is optional for running the delivered files.

Upgrades must replace core and all addons together and rerun the foundation tests. Never mix addon revisions. Other compressed model formats may require matching locally vendored Draco/KTX2/Meshopt decoders; these are not silently fetched from a CDN. The stage-2 test asset loads without extra decoders.

Upstream: https://github.com/mrdoob/three.js/tree/r180
GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
OrbitControls: https://threejs.org/docs/pages/OrbitControls.html

const RAD_TO_DEG = 180 / Math.PI;
const MS_TO_KN = 1.9438444924406046;
// Signal K keeps the last known value of a path around indefinitely, so measured
// values need an age check of their own to avoid reporting a dead sensor
const MAX_AGE_MS = 60000;
// Values that are set once and stay valid until changed
const NO_MAX_AGE = 0;

function selfValue(app, path, maxAge = MAX_AGE_MS) {
  const data = app.getSelfPath(path);
  if (data === null || data === undefined) {
    return undefined;
  }
  if (typeof data !== 'object' || !('value' in data)) {
    return data;
  }
  if (maxAge && data.timestamp) {
    const age = Date.now() - new Date(data.timestamp).getTime();
    if (Number.isFinite(age) && age > maxAge) {
      // Stale, better to report nothing than something wrong
      return undefined;
    }
  }
  return data.value;
}

function degrees(radians) {
  if (!Number.isFinite(radians)) {
    return undefined;
  }
  const deg = Math.round(radians * RAD_TO_DEG) % 360;
  return String(deg < 0 ? deg + 360 : deg).padStart(3, '0');
}

function anchorStatus(app, settings) {
  const position = selfValue(app, 'navigation.anchor.position', NO_MAX_AGE);
  if (!position || !Number.isFinite(position.latitude)) {
    return 'Anchor: not set';
  }
  const radiusPath = (settings.communications && settings.communications.anchor_radius_path)
    || 'navigation.anchor.distanceFromBow';
  const radius = selfValue(app, radiusPath);
  const bearing = degrees(selfValue(app, 'navigation.anchor.bearingTrue'));
  const maxRadius = selfValue(app, 'navigation.anchor.maxRadius', NO_MAX_AGE);
  const parts = [
    Number.isFinite(radius) ? `${Math.round(radius)}m` : 'n/a',
  ];
  if (bearing) {
    parts.push(`${bearing}T`);
  }
  if (Number.isFinite(maxRadius)) {
    parts.push(`max ${Math.round(maxRadius)}m`);
  }
  return `Anchor: ${parts.join(' ')}`;
}

function depthStatus(app) {
  const depth = selfValue(app, 'environment.depth.belowSurface');
  if (!Number.isFinite(depth)) {
    return 'Depth: n/a';
  }
  return `Depth: ${depth.toFixed(1)}m`;
}

function windStatus(app) {
  const speed = selfValue(app, 'environment.wind.speedTrue');
  const direction = degrees(selfValue(app, 'environment.wind.directionTrue'));
  if (!Number.isFinite(speed) && !direction) {
    return 'Wind: n/a';
  }
  const parts = [
    Number.isFinite(speed) ? `${(speed * MS_TO_KN).toFixed(1)}kn` : 'n/a',
  ];
  if (direction) {
    parts.push(`${direction}T`);
  }
  return `Wind: ${parts.join(' ')}`;
}

module.exports = {
  crewOnly: false,
  example: 'Status',
  accept: (msg) => (msg.data.toLowerCase() === 'status'),
  handle: (msg, settings, device, app) => {
    const status = [
      anchorStatus(app, settings),
      depthStatus(app),
      windStatus(app),
    ].join('\n');
    return device.sendText(status, msg.from, true, false);
  },
};

// How often environment metrics go out, in seconds
const DEFAULT_METRICS_INTERVAL = 240;
const DEFAULT_ANCHOR_RADIUS_PATH = 'navigation.anchor.distanceFromBow';

function communications(settings) {
  return (settings && settings.communications) || {};
}

function environmentMetricsInterval(settings) {
  const options = communications(settings);
  if (Number.isFinite(options.environment_metrics_interval)) {
    return options.environment_metrics_interval;
  }
  if (options.send_environment_metrics === false) {
    // Migrating a configuration from the boolean this setting replaced
    return 0;
  }
  return DEFAULT_METRICS_INTERVAL;
}

function anchorRadiusPath(settings) {
  return communications(settings).anchor_radius_path || DEFAULT_ANCHOR_RADIUS_PATH;
}

module.exports = {
  environmentMetricsInterval,
  anchorRadiusPath,
  DEFAULT_METRICS_INTERVAL,
};

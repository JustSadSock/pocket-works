// Small runtime guard: updateRouteUi replaces routeName text, so recreate its mode badge afterward.
var shp23BaseUpdateRouteExtras = shp23UpdateRouteExtras;
shp23UpdateRouteExtras = function shp23UpdateRouteExtrasStable() {
  const routeName = document.querySelector('#routeName');
  if (routeName && !document.querySelector('#routeModeBadge')) {
    const badge = document.createElement('span');
    badge.className = 'route-mode-badge';
    badge.id = 'routeModeBadge';
    badge.hidden = true;
    routeName.append(' ', badge);
  }
  shp23BaseUpdateRouteExtras();
};

shp23UpdateRouteExtras();

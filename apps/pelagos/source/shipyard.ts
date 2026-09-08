import { ACTIVE_SHIP, SHIPS, loadShipLoadout, resolveShip, saveShipLoadout } from './ship-config';

function option(select: HTMLSelectElement, value: string, label: string): void {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  select.append(item);
}

function meters(value: number): string {
  return `${value.toFixed(2).replace(/\.00$/, '')} м`;
}

export function installShipyard(): void {
  const trigger = document.querySelector<HTMLButtonElement>('#shipyardButton');
  const close = document.querySelector<HTMLButtonElement>('#closeShipyard');
  const apply = document.querySelector<HTMLButtonElement>('#applyShipyard');
  const screen = document.querySelector<HTMLElement>('#shipyard');
  const settings = document.querySelector<HTMLElement>('#settings');
  const shipSelect = document.querySelector<HTMLSelectElement>('#shipClassSelect');
  const paletteSelect = document.querySelector<HTMLSelectElement>('#hullPaletteSelect');
  const sailSelect = document.querySelector<HTMLSelectElement>('#sailPlanSelect');
  const oarSelect = document.querySelector<HTMLSelectElement>('#oarSetSelect');
  const dimensions = document.querySelector<HTMLElement>('#shipDimensions');
  const description = document.querySelector<HTMLElement>('#shipLoadoutDescription');
  if (!trigger || !close || !apply || !screen || !settings || !shipSelect || !paletteSelect || !sailSelect || !oarSelect || !dimensions || !description) return;

  const current = loadShipLoadout();
  SHIPS.forEach((ship) => option(shipSelect, ship.id, ship.label));
  shipSelect.value = current.shipId;

  const repopulate = (): void => {
    const ship = SHIPS.find((entry) => entry.id === shipSelect.value) ?? SHIPS[0];
    const previousPalette = paletteSelect.value || current.paletteId;
    const previousSail = sailSelect.value || current.sailPlanId;
    const previousOars = oarSelect.value || current.oarSetId;
    paletteSelect.replaceChildren();
    sailSelect.replaceChildren();
    oarSelect.replaceChildren();
    ship.palettes.forEach((entry) => option(paletteSelect, entry.id, entry.label));
    ship.sails.forEach((entry) => option(sailSelect, entry.id, entry.label));
    ship.oarSets.forEach((entry) => option(oarSelect, entry.id, entry.label));
    paletteSelect.value = ship.palettes.some((entry) => entry.id === previousPalette) ? previousPalette : ship.palettes[0].id;
    sailSelect.value = ship.sails.some((entry) => entry.id === previousSail) ? previousSail : ship.sails[0].id;
    oarSelect.value = ship.oarSets.some((entry) => entry.id === previousOars) ? previousOars : ship.oarSets[0].id;
    refreshReadout();
  };

  const refreshReadout = (): void => {
    const resolved = resolveShip({
      shipId: shipSelect.value,
      paletteId: paletteSelect.value,
      sailPlanId: sailSelect.value,
      oarSetId: oarSelect.value
    });
    const d = resolved.definition.dimensions;
    dimensions.innerHTML = `<b>${meters(d.hullLength)}</b><span>корпус</span><b>${meters(d.beam)}</b><span>ширина</span><b>${(d.displacementKg / 1000).toFixed(1)} т</b><span>водоизмещение</span><b>${resolved.oars.stations.length * 2}</b><span>вёсел</span>`;
    description.textContent = `${resolved.sail.description} ${resolved.oars.description}`;
  };

  shipSelect.addEventListener('change', repopulate);
  paletteSelect.addEventListener('change', refreshReadout);
  sailSelect.addEventListener('change', refreshReadout);
  oarSelect.addEventListener('change', refreshReadout);

  trigger.addEventListener('click', () => {
    settings.classList.add('hidden');
    screen.classList.remove('hidden');
    refreshReadout();
  });
  close.addEventListener('click', () => {
    screen.classList.add('hidden');
    settings.classList.remove('hidden');
  });
  apply.addEventListener('click', () => {
    const next = saveShipLoadout({
      shipId: shipSelect.value,
      paletteId: paletteSelect.value,
      sailPlanId: sailSelect.value,
      oarSetId: oarSelect.value
    });
    document.documentElement.dataset.pelagosPendingShip = next.shipId;
    window.location.reload();
  });

  repopulate();
  document.documentElement.dataset.pelagosShipClass = ACTIVE_SHIP.definition.id;
}

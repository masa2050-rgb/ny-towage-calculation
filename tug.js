const formatMoney = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const CURRENT_MARKET_FUEL = 4.73;
const CHART_MAX = 20000;

// ==========================================
// VESSEL DATA (Populate from your CSV)
// Format: [LOA_in_feet, GRT, NRT]
// *IMPORTANT: Ensure this list is sorted from lowest LOA to highest LOA*
// ==========================================
const vesselData = [
    [500, 10000, 5000],
    [800, 35000, 15000],
    [997, 65000, 30000],
    [1165, 120000, 55000],
    [1400, 160000, 75000]
];

function getTonnageFromLOA(targetLoa) {
    if (targetLoa <= vesselData[0][0]) {
        return { grt: vesselData[0][1], nrt: vesselData[0][2] };
    }
    if (targetLoa >= vesselData[vesselData.length - 1][0]) {
        return { grt: vesselData[vesselData.length - 1][1], nrt: vesselData[vesselData.length - 1][2] };
    }

    for (let i = 0; i < vesselData.length - 1; i++) {
        const low = vesselData[i];
        const high = vesselData[i + 1];

        if (targetLoa >= low[0] && targetLoa <= high[0]) {
            const ratio = (targetLoa - low[0]) / (high[0] - low[0]);
            const interpGRT = low[1] + ratio * (high[1] - low[1]);
            const interpNRT = low[2] + ratio * (high[2] - low[2]);

            return {
                grt: Math.round(interpGRT),
                nrt: Math.round(interpNRT)
            };
        }
    }
    return { grt: 0, nrt: 0 };
}

function getCurrentFuelPrice() {
    return CURRENT_MARKET_FUEL;
}

function handleDestinationChange() {
    const dest = document.getElementById('destination').value;
    const timeEl = document.getElementById('adjTime');

    if (dest === 'elizabeth') {
        timeEl.value = 1.0;
    } else if (dest === 'newyork') {
        timeEl.value = 1.0;
    } else if (dest === 'bayonne') {
        timeEl.value = 0.5; // Default for Bayonne is 0.50
    } else if (dest === 'redhook' || dest === 'none') {
        timeEl.value = 0.75;
    } else {
        timeEl.value = 0.75;
    }
    updateModel();
}

function updateModel() {
    // 1. Get Core Inputs
    const loa = parseFloat(document.getElementById('loa').value);
    const nrt = parseFloat(document.getElementById('nrt').value);
    const yearRate = parseFloat(document.getElementById('yearRate').value);
    const fuelPrice = parseFloat(document.getElementById('fuel').value);
    const direction = document.getElementById('direction').value;

    // Determine Routing / Billing 
    const destValue = document.getElementById('destination').value;
    const destinationRules = {
        bayonne: { runtime: 2.50, zones: '8 & 9', isKVK: false, defaultPolicy: 'waive', route: 'Newark Bay → Bayonne' },
        newyork: { runtime: 2.50, zones: '10 & 11', isKVK: true, defaultPolicy: 'standard', route: 'The Narrows → Kill Van Kull' },
        elizabeth: { runtime: 2.50, zones: '10 & 11', isKVK: true, defaultPolicy: 'waive', route: 'The Narrows → Kill Van Kull' },
        redhook: { runtime: 2.50, zones: '9 & 1/2', isKVK: false, defaultPolicy: 'waive', route: 'Upper New York Bay → Red Hook' },
        none: { runtime: 0.0, zones: 'N/A', isKVK: false, defaultPolicy: 'waive', route: 'N/A' }
    };

    const routeEntry = destinationRules[destValue] || { runtime: 0, zones: 'N/A', isKVK: false, defaultPolicy: 'waive', route: 'N/A' };
    const destinationRuntime = routeEntry.runtime;
    const isKVK = routeEntry.isKVK;
    let runtimePolicy = routeEntry.defaultPolicy;

    // Flip the path wording based on inbound vs outbound direction
    let displayRoute = routeEntry.route;
    if (direction === 'outbound' && displayRoute.includes('→')) {
        displayRoute = displayRoute.split(' → ').reverse().join(' → ');
    }
    document.getElementById('routeDetail').innerText = `Path: ${displayRoute} (Zones ${routeEntry.zones})`;

    let finalEscortRate = parseFloat(document.getElementById('escortRate').value);

    // Fetch time from the Adjustment Panel
    let actualTime = parseFloat(document.getElementById('adjTime').value) || 0;

    // Update UI Labels
// Update UI Labels
    const loaMeters = (loa * 0.3048).toFixed(2);
    document.getElementById('loa-ft-val').innerText = loa.toLocaleString() + ' ft';
    document.getElementById('loa-m-val').innerText = loaMeters.toLocaleString() + ' m';
    document.getElementById('nrt-val').innerText = nrt.toLocaleString();
    document.getElementById('fuel-val').innerText = '$' + fuelPrice.toFixed(2);
    document.getElementById('year-rate-val').innerText = '$' + yearRate.toLocaleString();
    document.getElementById('escort-rate-val').innerText = formatMoney(finalEscortRate) + '/hr';

    // Update stepper label for maneuver time
    const adjTimeValEl = document.getElementById('adjTime-display');
    if (adjTimeValEl) {
        adjTimeValEl.innerText = actualTime.toFixed(2);
    }

    // 3. Vessel Classification & Base Service Logic
    let vClass = "Standard";
    let baseIdealServices = 2;

    if (loa >= 1165) {
        vClass = "SLCV/MLCV";
        baseIdealServices = 4;
    } else if (loa >= 997) {
        vClass = "ULCV";
        baseIdealServices = 3;
    }

    let baseDocking = Math.min(5, baseIdealServices);
    // By default, Standard vessels don't get escort tugs unless manually adjusted.
    let baseEscort = (vClass === "Standard") ? 0 : baseDocking;

    // Apply "Escort-Only" anomaly strictly for KVK transits
    if (isKVK && vClass !== "Standard") {
        baseDocking = baseEscort - 1;
    }

    if (finalEscortRate === 0) {
        baseEscort = 0;
    }

    // Determine the baseline physical tug breakdown before manual adjustments
    let baseDualService = Math.min(baseDocking, baseEscort);
    let baseEscortOnly = Math.max(0, baseEscort - baseDualService);
    let baseDockingOnly = Math.max(0, baseDocking - baseDualService);

    // --- APPLY ADJUSTMENT PANEL MODIFIERS ---
    let adjDocking = parseInt(document.getElementById('adjDocking').value) || 0;
    let adjEscortDock = parseInt(document.getElementById('adjEscortDock').value) || 0;
    let adjEscortOnly = parseInt(document.getElementById('adjEscortOnly').value) || 0;

    // Apply adjustments directly to the physical tug buckets.
    // If a user clicks minus below 0, it forces a snap-back on the UI.
    let dockingOnlyCount = baseDockingOnly + adjDocking;
    if (dockingOnlyCount < 0) {
        dockingOnlyCount = 0;
        let forcedAdj = 0 - baseDockingOnly;
        document.getElementById('adjDocking').value = forcedAdj;
        document.getElementById('adjDocking-display').innerText = forcedAdj;
    }

    let dualServiceCount = baseDualService + adjEscortDock;
    if (dualServiceCount < 0) {
        dualServiceCount = 0;
        let forcedAdj = 0 - baseDualService;
        document.getElementById('adjEscortDock').value = forcedAdj;
        document.getElementById('adjEscortDock-display').innerText = forcedAdj;
    }

    let escortOnlyCount = baseEscortOnly + adjEscortOnly;
    if (escortOnlyCount < 0) {
        escortOnlyCount = 0;
        let forcedAdj = 0 - baseEscortOnly;
        document.getElementById('adjEscortOnly').value = forcedAdj;
        document.getElementById('adjEscortOnly-display').innerText = forcedAdj;
    }

    // Reconstruct the invoice line items from the physical tugs
    let dockingServices = dualServiceCount + dockingOnlyCount;
    let escortServices = dualServiceCount + escortOnlyCount;

    // Total Physical Tugs represent the sum of all three distinct buckets
    let maxPhysicalTugs = dockingOnlyCount + dualServiceCount + escortOnlyCount;

    // 4. Base Cost Calculation (Priced per Docking Service)
    const baseCost = dockingServices * yearRate;

    // 5. Vessel Size Premium Calculation
    const sizeCost = nrt > 40000 ? (dockingServices * 1400) : 0;

    // 6. Fuel Surcharge Calculation
    let fuelCost = 0;
    let fuelRatePerTug = 0;
    if (fuelPrice > 2.00) {
        // Calculate increments by rounding UP (Math.ceil) for any fraction of $0.10
        const increments = Math.ceil(Math.round((fuelPrice - 2.00) * 100) / 10);
        fuelRatePerTug = increments * 15;
        // Fuel surcharge applies to all physically dispatched tugs
        fuelCost = maxPhysicalTugs * fuelRatePerTug;
    }

    // 7. Escort Cost Calculation & Runtime Logic Handling
    let escortCost = 0;

    let effectiveRuntimeDual = 0;
    let effectiveRuntimeOnly = destinationRuntime; // Escort Only tugs always bill full round-trip runtime

    if (direction === 'outbound') {
        // Outbound transit is not waived, they bill the full standard runtime 
        effectiveRuntimeDual = destinationRuntime;
    } else {
        effectiveRuntimeDual = (runtimePolicy === 'waive') ? (destinationRuntime / 2) : destinationRuntime;
    }

    // Calculate time for Escort + Docking tugs
    let rawTimeDual = actualTime + effectiveRuntimeDual;
    let billedTimeDual = Math.max(2.0, Math.round(rawTimeDual * 2) / 2);

    // Calculate time for Escort Only tugs
    let rawTimeOnly = actualTime + effectiveRuntimeOnly;
    let billedTimeOnly = Math.max(2.0, Math.round(rawTimeOnly * 2) / 2);

    // Add up the totals
    if (dualServiceCount > 0) {
        escortCost += dualServiceCount * billedTimeDual * finalEscortRate;
    }
    if (escortOnlyCount > 0) {
        escortCost += escortOnlyCount * billedTimeOnly * finalEscortRate;
    }

    // 8. Update System Parameters UI (Services)
    document.getElementById('dockingTugs').innerText = dockingServices + ' Units';
    document.getElementById('escortDockTugs').innerText = dualServiceCount + ' Units';
    document.getElementById('escortOnlyTugs').innerText = escortOnlyCount + ' Units';

    document.getElementById('escortTime').innerText = actualTime.toFixed(2) + ' hrs';

    // Update Dynamic Readouts based on split logic
    if (dualServiceCount > 0 && escortOnlyCount > 0) {
        document.getElementById('zoneRunningTime').innerText = `${effectiveRuntimeDual.toFixed(2)}h (E+D) | ${effectiveRuntimeOnly.toFixed(2)}h (EO)`;
        document.getElementById('billedHours').innerText = `${billedTimeDual.toFixed(1)}h (E+D) | ${billedTimeOnly.toFixed(1)}h (EO)`;
    } else if (escortOnlyCount > 0) {
        document.getElementById('zoneRunningTime').innerText = `${effectiveRuntimeOnly.toFixed(2)} hrs`;
        document.getElementById('billedHours').innerText = `${billedTimeOnly.toFixed(1)} hrs`;
    } else {
        document.getElementById('zoneRunningTime').innerText = `${effectiveRuntimeDual.toFixed(2)} hrs`;
        document.getElementById('billedHours').innerText = `${billedTimeDual.toFixed(1)} hrs`;
    }

    const runtimeHintEl = document.getElementById('runtimeHint');
    if (runtimeHintEl) {
        if (destinationRuntime === 0) {
            runtimeHintEl.innerText = '';
        } else if (direction === 'outbound') {
            runtimeHintEl.innerText = 'Runtime not waived: Escort service occurs after undocking.';
            runtimeHintEl.style.color = 'var(--warning)';
        } else if (runtimePolicy === 'waive') {
            if (dualServiceCount > 0 && escortOnlyCount > 0) {
                runtimeHintEl.innerText = `Runtime waived for ${dualServiceCount} Escort+Docking tugs. Full runtime billed for ${escortOnlyCount} Escort Only tugs.`;
                runtimeHintEl.style.color = 'var(--accent-light)';
            } else if (escortOnlyCount > 0) {
                runtimeHintEl.innerText = 'Full runtime billed: Escort Only tugs do not receive docking waivers.';
                runtimeHintEl.style.color = 'var(--warning)';
            } else if (dualServiceCount > 0) {
                runtimeHintEl.innerText = 'Outbound runtime waived because escort tugs transitioned to docking.';
                runtimeHintEl.style.color = 'var(--success)';
            } else {
                runtimeHintEl.innerText = '';
            }
        } else {
            runtimeHintEl.innerText = '';
        }
    }

    // 9. Total Generation
    const total = baseCost + sizeCost + fuelCost + escortCost;

    // --- Update Total Invoice ---
    document.getElementById('totalCost').innerText = formatMoney(total);

    // Update Bar Chart with Fixed Bounds and Absolute Money Value
    const setBar = (id, val) => {
        const pct = Math.min((val / CHART_MAX) * 100, 100);
        const barEl = document.getElementById('bar-' + id);
        const valEl = document.getElementById('bar-val-' + id);

        if (barEl && valEl) {
            barEl.style.width = pct + '%';
            valEl.innerText = val > 0 ? formatMoney(val) : '$0';
        }
    };

    setBar('base', baseCost);
    setBar('size', sizeCost);
    setBar('fuel', fuelCost);
    setBar('escort', escortCost);
}

function setRate(value) {
    document.getElementById('yearRate').value = value;
    updateModel();
}

function setEscortRate(value) {
    document.getElementById('escortRate').value = value;
    updateModel();
}

function setFuelPrice(value) {
    document.getElementById('fuel').value = value;
    updateModel();
}

// Handler for the unit stepper buttons
function stepValue(id, delta) {
    const input = document.getElementById(id);
    const display = document.getElementById(id + '-display');

    let currentVal = parseInt(input.value) || 0;
    currentVal += delta;

    input.value = currentVal;
    display.innerText = currentVal;

    updateModel();
}

// Handler specifically for the time stepper (decimal math)
function stepTimeValue(delta) {
    const input = document.getElementById('adjTime');

    let currentVal = parseFloat(input.value) || 0;
    currentVal += delta;

    // Prevent negative maneuver time
    if (currentVal < 0) {
        currentVal = 0;
    }

    input.value = currentVal;

    // Display update is handled cleanly by updateModel()
    updateModel();
}

// Initialize
document.getElementById('fuel').value = getCurrentFuelPrice();
updateModel();
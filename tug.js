const formatMoney = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const CURRENT_MARKET_FUEL = 4.73;

const vesselData = [
    [500, 10000, 5000],
    [800, 35000, 15000],
    [997, 65000, 30000],
    [1165, 120000, 55000],
    [1400, 160000, 75000]
];

// Moving destination rules to the top so our new routing handler can access them
const destinationRules = {
    bayonne: { runtime: 2.50, zones: '8 & 9', isKVK: false, defaultPolicy: 'waive', route: 'Newark Bay → Bayonne' },
    newyork: { runtime: 2.50, zones: '10 & 11', isKVK: true, defaultPolicy: 'standard', route: 'The Narrows → Kill Van Kull' },
    elizabeth: { runtime: 2.50, zones: '10 & 11', isKVK: true, defaultPolicy: 'waive', route: 'The Narrows → Kill Van Kull' },
    redhook: { runtime: 2.50, zones: '9 & 1/2', isKVK: false, defaultPolicy: 'waive', route: 'Upper New York Bay → Red Hook' },
    none: { runtime: 0.0, zones: 'N/A', isKVK: false, defaultPolicy: 'waive', route: 'N/A' }
};

function getTonnageFromLOA(targetLoa) {
    if (targetLoa <= vesselData[0][0]) return { grt: vesselData[0][1], nrt: vesselData[0][2] };
    if (targetLoa >= vesselData[vesselData.length - 1][0]) return { grt: vesselData[vesselData.length - 1][1], nrt: vesselData[vesselData.length - 1][2] };

    for (let i = 0; i < vesselData.length - 1; i++) {
        const low = vesselData[i];
        const high = vesselData[i + 1];

        if (targetLoa >= low[0] && targetLoa <= high[0]) {
            const ratio = (targetLoa - low[0]) / (high[0] - low[0]);
            return {
                grt: Math.round(low[1] + ratio * (high[1] - low[1])),
                nrt: Math.round(low[2] + ratio * (high[2] - low[2]))
            };
        }
    }
    return { grt: 0, nrt: 0 };
}

function getCurrentFuelPrice() {
    return CURRENT_MARKET_FUEL;
}

// Centralized handler for when routing inputs change
function handleRoutingChange(isDestinationChange = false) {
    const destValue = document.getElementById('destination').value;
    const direction = document.getElementById('direction').value;
    const routeEntry = destinationRules[destValue] || destinationRules.none;

    // 1. Update Actual Times ONLY if the Terminal changed
    if (isDestinationChange) {
        let defaultTime = 0.75;
        if (destValue === 'elizabeth' || destValue === 'newyork') defaultTime = 1.0;
        else if (destValue === 'bayonne') defaultTime = 0.5;
        
        if (document.getElementById('adjTime')) document.getElementById('adjTime').value = defaultTime;
        if (document.getElementById('adjTimeOnly')) document.getElementById('adjTimeOnly').value = defaultTime;
    }

    // 2. Update Baseline Runtimes based on Terminal & Direction logic
    const destinationRuntime = routeEntry.runtime;
    const runtimePolicy = routeEntry.defaultPolicy;

    let effectiveRuntimeDual = destinationRuntime;
    let effectiveRuntimeOnly = destinationRuntime;

    if (direction === 'inbound') {
        effectiveRuntimeDual = (runtimePolicy === 'waive') ? (destinationRuntime / 2) : destinationRuntime;
    }

    if (document.getElementById('adjRuntime')) document.getElementById('adjRuntime').value = effectiveRuntimeDual;
    if (document.getElementById('adjRuntimeOnly')) document.getElementById('adjRuntimeOnly').value = effectiveRuntimeOnly;

    updateModel();
}

function updateModel() {
    const loa = parseFloat(document.getElementById('loa').value);
    const nrt = parseFloat(document.getElementById('nrt').value);
    const yearRate = parseFloat(document.getElementById('yearRate').value);
    const fuelPrice = parseFloat(document.getElementById('fuel').value);
    const direction = document.getElementById('direction').value;
    const destValue = document.getElementById('destination').value;
    
    const routeEntry = destinationRules[destValue] || destinationRules.none;
    const destinationRuntime = routeEntry.runtime;
    const isKVK = routeEntry.isKVK;
    let runtimePolicy = routeEntry.defaultPolicy;

    let displayRoute = routeEntry.route;
    if (direction === 'outbound' && displayRoute.includes('→')) {
        displayRoute = displayRoute.split(' → ').reverse().join(' → ');
    }
    document.getElementById('routeDetail').innerText = `Path: ${displayRoute} (Zones ${routeEntry.zones})`;

    let finalEscortRate = parseFloat(document.getElementById('escortRate').value);

    // Fetch times & runtimes directly from the user-facing inputs
    let actualTime = parseFloat(document.getElementById('adjTime').value) || 0;
    let actualTimeOnly = parseFloat(document.getElementById('adjTimeOnly')?.value) || 0;
    let effectiveRuntimeDual = parseFloat(document.getElementById('adjRuntime')?.value) || 0;
    let effectiveRuntimeOnly = parseFloat(document.getElementById('adjRuntimeOnly')?.value) || 0;

    // Update UI Labels
    const loaMeters = (loa * 0.3048).toFixed(2);
    document.getElementById('loa-ft-val').innerText = loa.toLocaleString() + ' ft';
    document.getElementById('loa-m-val').innerText = loaMeters.toLocaleString() + ' m';
    document.getElementById('nrt-val').innerText = nrt.toLocaleString();
    document.getElementById('fuel-val').innerText = '$' + fuelPrice.toFixed(2);
    document.getElementById('year-rate-val').innerText = '$' + yearRate.toLocaleString();
    document.getElementById('escort-rate-val').innerText = formatMoney(finalEscortRate) + '/hr';

    // Update time stepper displays
    if (document.getElementById('adjTime-display')) document.getElementById('adjTime-display').innerText = actualTime.toFixed(2);
    if (document.getElementById('adjTimeOnly-display')) document.getElementById('adjTimeOnly-display').innerText = actualTimeOnly.toFixed(2);
    if (document.getElementById('adjRuntime-display')) document.getElementById('adjRuntime-display').innerText = effectiveRuntimeDual.toFixed(2);
    if (document.getElementById('adjRuntimeOnly-display')) document.getElementById('adjRuntimeOnly-display').innerText = effectiveRuntimeOnly.toFixed(2);

    let vClass = "Standard";
    let baseIdealServices = 2;

    if (loa >= 1165) {
        vClass = "SLCV/MLCV";
        baseIdealServices = 4;
    } else if (loa >= 850) {
        vClass = "ULCV";
        baseIdealServices = 3;
    }

    let baseDocking = Math.min(5, baseIdealServices);
    let baseEscort = (vClass === "Standard") ? 0 : baseDocking;

    if (isKVK && vClass !== "Standard") baseDocking = baseEscort - 1;
    if (finalEscortRate === 0) baseEscort = 0;

    let baseDualService = Math.min(baseDocking, baseEscort);
    let baseEscortOnly = Math.max(0, baseEscort - baseDualService);
    let baseDockingOnly = Math.max(0, baseDocking - baseDualService);

    let adjDocking = parseInt(document.getElementById('adjDocking').value) || 0;
    let adjEscortDock = parseInt(document.getElementById('adjEscortDock').value) || 0;
    let adjEscortOnly = parseInt(document.getElementById('adjEscortOnly').value) || 0;

    let dockingOnlyCount = Math.max(0, baseDockingOnly + adjDocking);
    if (baseDockingOnly + adjDocking < 0) { document.getElementById('adjDocking').value = -baseDockingOnly; document.getElementById('adjDocking-display').innerText = -baseDockingOnly; }
    
    let dualServiceCount = Math.max(0, baseDualService + adjEscortDock);
    if (baseDualService + adjEscortDock < 0) { document.getElementById('adjEscortDock').value = -baseDualService; document.getElementById('adjEscortDock-display').innerText = -baseDualService; }
    
    let escortOnlyCount = Math.max(0, baseEscortOnly + adjEscortOnly);
    if (baseEscortOnly + adjEscortOnly < 0) { document.getElementById('adjEscortOnly').value = -baseEscortOnly; document.getElementById('adjEscortOnly-display').innerText = -baseEscortOnly; }

    // --- APPLY MAXIMUM 5 TUGS LIMIT ---
    let maxPhysicalTugs = dockingOnlyCount + dualServiceCount + escortOnlyCount;
    if (maxPhysicalTugs > 5) {
        let overflow = maxPhysicalTugs - 5;
        // Prioritize rejecting the most recent user additions if it pushes total over 5
        if (adjEscortOnly > 0 && overflow > 0) {
            let reduction = Math.min(adjEscortOnly, overflow);
            adjEscortOnly -= reduction; escortOnlyCount -= reduction; overflow -= reduction;
            document.getElementById('adjEscortOnly').value = adjEscortOnly;
            document.getElementById('adjEscortOnly-display').innerText = adjEscortOnly;
        }
        if (adjEscortDock > 0 && overflow > 0) {
            let reduction = Math.min(adjEscortDock, overflow);
            adjEscortDock -= reduction; dualServiceCount -= reduction; overflow -= reduction;
            document.getElementById('adjEscortDock').value = adjEscortDock;
            document.getElementById('adjEscortDock-display').innerText = adjEscortDock;
        }
        if (adjDocking > 0 && overflow > 0) {
            let reduction = Math.min(adjDocking, overflow);
            adjDocking -= reduction; dockingOnlyCount -= reduction; overflow -= reduction;
            document.getElementById('adjDocking').value = adjDocking;
            document.getElementById('adjDocking-display').innerText = adjDocking;
        }
        maxPhysicalTugs = 5;
    }

    let dockingServices = dualServiceCount + dockingOnlyCount;

    // --- Core Cost Math Calculations ---
    const baseCost = dockingServices * yearRate;
    
    const sizeCostPerTug = nrt > 40000 ? 1400 : 0;
    const sizeCost = dockingServices * sizeCostPerTug;

    let fuelCost = 0;
    let fuelRatePerTug = 0;
    if (fuelPrice > 2.00) {
        const increments = Math.ceil(Math.round((fuelPrice - 2.00) * 100) / 10);
        fuelRatePerTug = increments * 15;
        fuelCost = maxPhysicalTugs * fuelRatePerTug;
    }

    let escortCost = 0;
    let rawTimeDual = actualTime + effectiveRuntimeDual;
    let billedTimeDual = Math.max(2.0, Math.round(rawTimeDual * 2) / 2);
    let escortDualCostPerTug = billedTimeDual * finalEscortRate;

    let rawTimeOnly = actualTimeOnly + effectiveRuntimeOnly;
    let billedTimeOnly = Math.max(2.0, Math.round(rawTimeOnly * 2) / 2);
    let escortOnlyCostPerTug = billedTimeOnly * finalEscortRate;

    if (dualServiceCount > 0) escortCost += dualServiceCount * escortDualCostPerTug;
    if (escortOnlyCount > 0) escortCost += escortOnlyCount * escortOnlyCostPerTug;

    // --- Runtime Hint Handling ---
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
                runtimeHintEl.innerText = 'Runtime waived because escort tugs transitioned to docking; Min. 2.0 hrs.';
                runtimeHintEl.style.color = 'var(--success)';
            } else {
                runtimeHintEl.innerText = '';
            }
        } else {
            runtimeHintEl.innerText = '';
        }
    }

    // --- Update Total Invoice ---
    const total = baseCost + sizeCost + fuelCost + escortCost;
    if (document.getElementById('totalCost')) document.getElementById('totalCost').innerText = formatMoney(total);


    // --- Generate Per-Tug Breakdown Cards ---
    let tugBreakdownHTML = '';
    
    let tugs = [];
    
    // Populate Dual Service Tugs
    for(let i=0; i<dualServiceCount; i++) {
        tugs.push({
            type: 'Escort + Docking', 
            dockingCost: yearRate, dockingUnit: '1 Unit',
            nrtCost: sizeCostPerTug, nrtUnit: sizeCostPerTug > 0 ? '1 Unit' : '0 Units',
            fuelCost: fuelRatePerTug, fuelUnit: fuelRatePerTug > 0 ? '1 Unit' : '0 Units',
            escortCost: escortDualCostPerTug, escortUnit: billedTimeDual.toFixed(1) + ' hrs'
        });
    }
    
    // Populate Docking Only Tugs
    for(let i=0; i<dockingOnlyCount; i++) {
        tugs.push({
            type: 'Docking Only', 
            dockingCost: yearRate, dockingUnit: '1 Unit',
            nrtCost: sizeCostPerTug, nrtUnit: sizeCostPerTug > 0 ? '1 Unit' : '0 Units',
            fuelCost: fuelRatePerTug, fuelUnit: fuelRatePerTug > 0 ? '1 Unit' : '0 Units',
            escortCost: 0, escortUnit: '0.0 hrs'
        });
    }
    
    // Populate Escort Only Tugs
    for(let i=0; i<escortOnlyCount; i++) {
        tugs.push({
            type: 'Escort Only', 
            dockingCost: 0, dockingUnit: '0 Units',
            nrtCost: 0, nrtUnit: '0 Units',
            fuelCost: fuelRatePerTug, fuelUnit: fuelRatePerTug > 0 ? '1 Unit' : '0 Units',
            escortCost: escortOnlyCostPerTug, escortUnit: billedTimeOnly.toFixed(1) + ' hrs'
        });
    }
    
    if (tugs.length === 0) {
        tugBreakdownHTML += '<div style="font-size: 0.8rem; color: #666;">No tugs dispatched.</div>';
    } else {
        tugs.forEach((tug, index) => {
            tugBreakdownHTML += `
            <div style="margin-top: 0.75rem; background: #fdfdfd; padding: 0.6rem 0.75rem; border-radius: 6px; border: 1px solid #e8e4db; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="font-weight: 700; font-size: 0.85rem; color: var(--accent); margin-bottom: 0.4rem; border-bottom: 1px solid #f0ece5; padding-bottom: 0.2rem;">
                    Tug ${index + 1} <span style="font-weight: 500; color: var(--text-muted); font-size: 0.75rem;">(${tug.type})</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.2rem; color: var(--text-main);">
                    <span style="flex: 1;">Docking</span>
                    <span style="flex: 1; text-align: center; color: var(--text-muted);">${tug.dockingUnit}</span>
                    <span style="flex: 1; text-align: right;">${formatMoney(tug.dockingCost)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.2rem; color: var(--text-main);">
                    <span style="flex: 1;">+40k NRT</span>
                    <span style="flex: 1; text-align: center; color: var(--text-muted);">${tug.nrtUnit}</span>
                    <span style="flex: 1; text-align: right;">${formatMoney(tug.nrtCost)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.2rem; color: var(--text-main);">
                    <span style="flex: 1;">Fuel</span>
                    <span style="flex: 1; text-align: center; color: var(--text-muted);">${tug.fuelUnit}</span>
                    <span style="flex: 1; text-align: right;">${formatMoney(tug.fuelCost)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; color: var(--text-main);">
                    <span style="flex: 1;">Escort</span>
                    <span style="flex: 1; text-align: center; color: var(--text-muted); font-weight: 400;">${tug.escortUnit}</span>
                    <span style="flex: 1; text-align: right;">${formatMoney(tug.escortCost)}</span>
                </div>
            </div>`;
        });
    }
    
    const breakdownContainer = document.getElementById('tugBreakdownContainer');
    if (breakdownContainer) breakdownContainer.innerHTML = tugBreakdownHTML;
}

function setRate(value) { document.getElementById('yearRate').value = value; updateModel(); }
function setEscortRate(value) { document.getElementById('escortRate').value = value; updateModel(); }
function setFuelPrice(value) { document.getElementById('fuel').value = value; updateModel(); }

function stepValue(id, delta) {
    const input = document.getElementById(id);
    const display = document.getElementById(id + '-display');
    let currentVal = parseInt(input.value) || 0;
    currentVal += delta;
    input.value = currentVal;
    display.innerText = currentVal;
    updateModel();
}

function stepTimeValue(id, delta) {
    const input = document.getElementById(id);
    if (!input) return;
    let currentVal = parseFloat(input.value) || 0;
    currentVal += delta;
    if (currentVal < 0) currentVal = 0; // Prevent negative time
    input.value = currentVal;
    updateModel();
}

// Initialize: Set fuel and run the routing handler to seed the initial math
document.getElementById('fuel').value = getCurrentFuelPrice();
handleRoutingChange(true);
const formatMoney = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const CURRENT_MARKET_FUEL = 4.73;

function getCurrentFuelPrice() {
    // Defaults to EIA NY Harbor ULSD index
    return CURRENT_MARKET_FUEL;
}

function handleDestinationChange() {
    const dest = document.getElementById('destination').value;
    const policyEl = document.getElementById('runtimePolicy');
    const timeEl = document.getElementById('actualTime');
    
    if (dest === 'elizabeth') {
        policyEl.value = 'waive';
        timeEl.value = 1.0; 
    } else if (dest === 'newyork') {
        policyEl.value = 'standard';
        timeEl.value = 1.0; 
    } else if (dest === 'bayonne' || dest === 'redhook' || dest === 'none') {
        policyEl.value = 'waive';
        timeEl.value = 0.75;
    } else {
        policyEl.value = 'standard';
        timeEl.value = 0.75;
    }
    updateModel(); // Recalculate everything
}

function updateModel() {
    // Get inputs
    const teu = parseFloat(document.getElementById('teu').value);
    
    // Calculate LOA based on TEU using conversion rules
    let loa;
    if (teu <= 5100) {
        // Panamax
        loa = 965;
    } else if (teu < 10000) {
        // Linear interpolation from 965 to 1200
        loa = 965 + (teu - 5100) * (1200 - 965) / (10000 - 5100);
    } else if (teu <= 14500) {
        // Neo-Panamax/VLCS
        loa = 1200;
    } else {
        // Linear interpolation from 1200 to 1300
        loa = 1200 + (teu - 14500) * (1300 - 1200) / (24000 - 14500);
    }
    loa = Math.round(loa);
    
    // Calculate NRT and GRT based on fleet-specific linear regression formulas
    const nrt = Math.round(1253 + (5.12 * teu));
    const grt = Math.round(3431 + (10.22 * teu));
    
    const yearRateInput = document.getElementById('yearRate');
    const yearRate = parseFloat(yearRateInput.value);
    const fuelPrice = parseFloat(document.getElementById('fuel').value);
    
    // Escort & Runtime Inputs
    let actualTime = parseFloat(document.getElementById('actualTime').value);
    const destValue = document.getElementById('destination').value;
    let runtimePolicy = document.getElementById('runtimePolicy').value;

    // Determine Routing / Billing in knowledge base
    const destinationRules = {
        bayonne: { runtime: 2.50, zones: '8 & 9', isKVK: false, defaultPolicy: 'waive', route: 'Newark Bay → Bayonne' },
        newyork: { runtime: 2.50, zones: '10 & 11', isKVK: true, defaultPolicy: 'standard', route: 'The Narrows → Kill Van Kull' },
        elizabeth: { runtime: 2.50, zones: '10 & 11', isKVK: true, defaultPolicy: 'waive', route: 'The Narrows → Kill Van Kull' },
        redhook: { runtime: 2.50, zones: '9 & 1/2', isKVK: false, defaultPolicy: 'waive', route: 'Upper New York Bay → Red Hook' }
    };

    const routeEntry = destinationRules[destValue] || { runtime: 0, zones: 'N/A', isKVK: false, defaultPolicy: 'waive', route: 'N/A' };
    const destinationRuntime = routeEntry.runtime;
    const isKVK = routeEntry.isKVK;

    // Route detail output
    document.getElementById('routeDetail').innerText = `Path: ${routeEntry.route} (Zones ${routeEntry.zones})`;

    // Fetch Escort Rate from slider
    let finalEscortRate = parseFloat(document.getElementById('escortRate').value);

    // Update UI Labels
    document.getElementById('teu-val').innerText = teu.toLocaleString();
    document.getElementById('fuel-val').innerText = '$' + fuelPrice.toFixed(2);
    document.getElementById('year-rate-val').innerText = '$' + yearRate.toLocaleString();
    document.getElementById('escort-rate-val').innerText = formatMoney(finalEscortRate) + '/hr';
    document.getElementById('actual-time-val').innerText = actualTime.toFixed(2) + ' hrs';
    document.getElementById('calculatedLoa').innerText = loa;
    document.getElementById('estimatedNrt').innerText = nrt.toLocaleString();
    document.getElementById('estimatedGrt').innerText = grt.toLocaleString();
    
    // Fetch Cargo TEU and enforce constraints without changing the slider scale
    let cargoTeuInput = document.getElementById('cargoTeu');
    let cargoTeu = parseFloat(cargoTeuInput.value);
    
    // Prevent Cargo from exceeding Vessel Capacity
    if (cargoTeu > teu) {
        cargoTeu = teu;
        cargoTeuInput.value = teu; // Visually force the thumb down to match capacity
    }
    
    document.getElementById('cargo-teu-val').innerText = cargoTeu.toLocaleString() + ' TEUs';

    // 1. Vessel Classification & Decoupled Tug Count Logic
    let vClass = "Standard";
    let baseIdealTugs = 2;

    // Determine Ideal Baseline Tugs (Perfect Conditions, Working Thruster)
    if (loa >= 1165) {
        vClass = "SLCV/MLCV";
        baseIdealTugs = 4;
    } else if (loa >= 997) {
        vClass = "ULCV";
        baseIdealTugs = 3; 
    }

    // Determine Maximum Overlapping Penalty
    let maxPenalty = 0; // No thruster penalty (assuming working thruster)
    
    // Check active situational chips and find the highest penalty (they do not stack)
    document.querySelectorAll('.toggle-chip.active').forEach(chip => {
        let chipPenalty = parseInt(chip.getAttribute('data-tugs'));
        if (chipPenalty > maxPenalty) {
            maxPenalty = chipPenalty;
        }
    });

    // Apply penalty to baseline and strictly cap at 5 tugs
    let baseTugs = Math.min(5, baseIdealTugs + maxPenalty);

    let escortTugs = baseTugs;
    let dockingTugs = baseTugs;

    // Apply "Escort-Only" anomaly strictly for KVK transits
    if (isKVK && vClass !== "Standard") {
        dockingTugs = escortTugs - 1; // 1 tug is released before docking
    }

    // If No Escort selected, zero out escort tugs
    if (finalEscortRate === 0) {
        escortTugs = 0;
    }

    // Determine physical tugs on job and those strictly serving escort
    let maxPhysicalTugs = Math.max(dockingTugs, escortTugs);
    let escortOnlyCount = Math.max(0, maxPhysicalTugs - dockingTugs);

    document.getElementById('vesselClass').innerText = vClass;

    // 2. Base Cost (Only applies to Docking Tugs)
    const baseCost = dockingTugs * yearRate;

    // 3. Vessel Size Premium (Only applies to Docking Tugs)
    const sizeCost = nrt > 40000 ? (dockingTugs * 1400) : 0;

    // 4. Fuel Surcharge (Applies to ALL physically dispatched tugs)
    let fuelCost = 0;
    let fuelRatePerTug = 0;
    if (fuelPrice > 2.00) {
        // Evaluate the Step-Function: Math.floor((price - 2.00) / 0.10) * 15
        // Using Math.round prior to Math.floor effectively avoids JS floating point issues (like 2.10 - 2.00)
        const increments = Math.floor(Math.round((fuelPrice - 2.00) * 100) / 10);
        fuelRatePerTug = increments * 15;
        fuelCost = maxPhysicalTugs * fuelRatePerTug;
    }

    // 5. Escort Cost (Applies to all Tugs actively escorting)
    let escortCost = 0;
    let billedTime = 0;

    // Absorbed Runtime Anomaly: waive outbound transit when flat-rate docking follows escort
    let effectiveRuntime = (runtimePolicy === 'waive') ? (destinationRuntime / 2) : destinationRuntime;
    let rawTime = actualTime + effectiveRuntime;
    let roundedTime = Math.round(rawTime * 2) / 2;
    billedTime = Math.max(2.0, roundedTime);

    if (escortTugs > 0 && vClass !== "Standard") {
        escortCost = escortTugs * billedTime * finalEscortRate;
    } else {
        // In case there are no qualifying escort tugs for this class
        rawTime = 0;
        billedTime = 0;
    }
    
    // Update Tug Counts in System Parameters UI
    document.getElementById('maxPhysicalTugs').innerText = maxPhysicalTugs + ' Tugs';
    document.getElementById('dockingTugs').innerText = dockingTugs + ' Tugs';
    document.getElementById('escortOnlyTugs').innerText = escortOnlyCount + ' Tugs';
    document.getElementById('escortTugs').innerText = escortTugs + ' Tugs';

    document.getElementById('appliedRuntime').innerText = effectiveRuntime.toFixed(2) + ' hrs';
    document.getElementById('rawTimeCalculated').innerText = rawTime.toFixed(2) + ' hrs';
    document.getElementById('billedHours').innerText = billedTime.toFixed(1) + ' hrs';

    const runtimeHintEl = document.getElementById('runtimeHint');
    if (runtimeHintEl) {
        if (runtimePolicy === 'waive') {
            runtimeHintEl.innerText = 'Outbound runtime waived because tug transitioned to docking.';
            runtimeHintEl.style.color = 'var(--accent-green)';
        } else {
            runtimeHintEl.innerText = '';
        }
    }

    // 6. Total
    const total = baseCost + sizeCost + fuelCost + escortCost;

    // 7. Unit Economics KPIs
    const vesselOpexPerTeu = total / teu;
    const commercialOpexPerTeu = cargoTeu > 0 ? (total / cargoTeu) : 0;

    // --- Update Financial Outputs & Math Columns ---
    document.getElementById('baseCost').innerText = formatMoney(baseCost);
    document.getElementById('baseMath').innerText = `${formatMoney(yearRate)} × ${dockingTugs} tugs`;

    document.getElementById('sizeCost').innerText = formatMoney(sizeCost);
    document.getElementById('sizeMath').innerText = sizeCost > 0 ? `$1,400.00 × ${dockingTugs} tugs` : '-';

    document.getElementById('fuelCost').innerText = formatMoney(fuelCost);
    if (fuelCost > 0) {
        document.getElementById('fuelMath').innerText = `${formatMoney(fuelRatePerTug)} × ${maxPhysicalTugs} tugs`;
    } else {
        document.getElementById('fuelMath').innerText = '-';
    }

    document.getElementById('escortCost').innerText = formatMoney(escortCost);
    if (escortCost > 0) {
        document.getElementById('escortMath').innerText = `${formatMoney(finalEscortRate)}/hr × ${billedTime.toFixed(1)}h × ${escortTugs} tugs`;
    } else {
        document.getElementById('escortMath').innerText = '-';
    }

    document.getElementById('totalCost').innerText = formatMoney(total);

    // Update Bar Chart
    const setBar = (id, val) => {
        const pct = total > 0 ? (val / total) * 100 : 0;
        document.getElementById('bar-' + id).style.width = pct + '%';
        document.getElementById('bar-val-' + id).innerText = pct.toFixed(1) + '%';
    };

    setBar('base', baseCost);
    setBar('size', sizeCost);
    setBar('fuel', fuelCost);
    setBar('escort', escortCost);

    // Update KPI UI
    document.getElementById('vesselOpex').innerText = formatMoney(vesselOpexPerTeu) + ' / TEU';
    document.getElementById('commercialOpex').innerText = formatMoney(commercialOpexPerTeu) + ' / TEU';
}

function setRate(value) {
    document.getElementById('yearRate').value = value;
    updateModel();
}

function setEscortRate(value) {
    document.getElementById('escortRate').value = value;
    updateModel();
}

function toggleTrigger(element) {
    element.classList.toggle('active');
    updateModel();
}

function setFuelPrice(value) {
    document.getElementById('fuel').value = value;
    updateModel();
}

// Initialize fuel price
document.getElementById('fuel').value = getCurrentFuelPrice();

// Initialize
updateModel();

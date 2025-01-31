const Settings = (function () {
  let settings;

  function getFormValues() {
    const form = document.getElementById('scenarioForm');
    return {
      currentAge: parseInt(form.currentAge.value),
      startYear: parseInt(form.startYear.value),
      planDuration: parseInt(form.planDuration.value),
      referenceRate: parseFloat(form.referenceRate.value)
    };
  }

  function initialize() {
    const form = document.getElementById('scenarioForm');
    form.addEventListener('submit', handleSubmit);

    // Get initial values from form
    // Initialize config with form values
    handleSubmit();
  }

  function handleSubmit(e) {
    if (e) {
      e.preventDefault();
    }
    settings = getFormValues();
    ConfigManager.updateFromSettings(settings);
    SplineEditor.initialize();
  }

  return {
    initialize,
    getSettings: () => ({
      ...settings
    })
  };
})();

const ConfigManager = (function () {
  const defaultConfig = {
    MAX_WITHDRAW_PRCT: 10.00,
    MIN_WITHDRAW_PRCT: 0.00,
    REFERENCE_WITHDRAW_PRCT: null,
    CURRENT_AGE: null,
    PLAN_AGE: null,
    MIN_YEAR: null,
    MAX_YEAR: null,
    MIN_SEPARATION: 50,
    DISTANCE_FROM_EDGE: 25,
    COLORS: {
      GRAY: 'gray',
      LIGHT_BLUE: 'lightblue',
      BLACK: 'black'
    }
  };

  let config = {
    ...defaultConfig
  };

  function updateFromSettings(settings) {
    config = Object.freeze({
      ...config,
      CURRENT_AGE: settings.currentAge,
      MIN_YEAR: settings.startYear,
      PLAN_AGE: settings.currentAge + settings.planDuration,
      REFERENCE_WITHDRAW_PRCT: settings.referenceRate,
      MAX_YEAR: settings.startYear + settings.planDuration
    });
  }

  return {
    getValues() {
      return {
        ...config
      };
    },
    updateFromSettings
  };
})();

const SplineEditor = (function () {
  let canvas;
  let ctx;
  let points;
  let draggingPoint = null;
  let displayMode = 'year';
  let xAxisPosition;
  let referenceY;

  function initialize() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    xAxisPosition = canvas.height - 75;

    const { REFERENCE_WITHDRAW_PRCT, MAX_WITHDRAW_PRCT } = ConfigManager.getValues();
    referenceY = xAxisPosition - (REFERENCE_WITHDRAW_PRCT / MAX_WITHDRAW_PRCT) * xAxisPosition;

    points = getDragPoints();
    attachCanvasHandlers();
    draw();
  }

  function getDragPoints() {
    const MID_POINT = canvas.width / 2;
    const { DISTANCE_FROM_EDGE } = ConfigManager.getValues();

    return [
      { name: 'initial', x: DISTANCE_FROM_EDGE },
      { name: 'mid-1',   x: DISTANCE_FROM_EDGE + (MID_POINT - DISTANCE_FROM_EDGE) / 3 },
      { name: 'mid-2',   x: MID_POINT },
      { name: 'mid-3',   x: MID_POINT + ((canvas.width - DISTANCE_FROM_EDGE - MID_POINT) * 2 / 3) },
      { name: 'final',   x: canvas.width - DISTANCE_FROM_EDGE }
    ].map(point => ({ ...point, y: referenceY }));
  }

  function attachCanvasHandlers() {
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseout', handleMouseUp);
  }

  function handleMouseDown(e) {
    const {
      offsetX,
      offsetY
    } = e;
    draggingPoint = points.find(point => Math.abs(point.x - offsetX) < 10 && Math.abs(point.y - offsetY) < 10);
  }

  function handleMouseMove(e) {
    if (draggingPoint) {
      const { offsetX, offsetY } = e;
      const index = points.indexOf(draggingPoint);
      if (index > 0 && index < points.length - 1) {
        const { MIN_SEPARATION } = ConfigManager.getValues();
        const minX = points[index - 1].x + MIN_SEPARATION;
        const maxX = points[index + 1].x - MIN_SEPARATION;
        draggingPoint.x = Math.max(minX, Math.min(maxX, offsetX));
      }
      draggingPoint.y = Math.min(offsetY, xAxisPosition);
      draw();
    }
  }

  function handleMouseUp() {
    draggingPoint = null;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawXAxis();
    drawReferenceLine();
    drawWithdrawCurve();
    plotPoints();
  }

  function drawXAxis() {
    const { COLORS, MIN_YEAR, MAX_YEAR, CURRENT_AGE, PLAN_AGE, DISTANCE_FROM_EDGE } = ConfigManager.getValues();

    ctx.strokeStyle = COLORS.GRAY;
    ctx.beginPath();
    ctx.moveTo(0, xAxisPosition);
    ctx.lineTo(canvas.width, xAxisPosition);
    ctx.stroke();

    const useYear = displayMode === 'year';
    const useAge = displayMode === 'age';

    points.forEach((point, index) => {
      let label;
      if (index === 0) {
        label = useYear ? MIN_YEAR : (useAge ? CURRENT_AGE : 1);
      } else if (index === points.length - 1) {
        label = useYear ? MAX_YEAR : (useAge ? PLAN_AGE : MAX_YEAR - MIN_YEAR + 1);
      } else {
        const fraction = (point.x - DISTANCE_FROM_EDGE) / (canvas.width - 2 * DISTANCE_FROM_EDGE);
        if (useYear) {
          label = MIN_YEAR + Math.round(fraction * (MAX_YEAR - MIN_YEAR));
        } else if (useAge) {
          label = CURRENT_AGE + Math.round(fraction * (PLAN_AGE - CURRENT_AGE));
        } else {
          label = 1 + Math.round(fraction * (MAX_YEAR - MIN_YEAR));
        }
      }
      ctx.fillText(`${label}`, point.x - 10, xAxisPosition + 20);
      ctx.beginPath();
      ctx.moveTo(point.x, xAxisPosition - 5);
      ctx.lineTo(point.x, xAxisPosition + 5);
      ctx.stroke();
    });
  }

  function drawReferenceLine() {
    const { COLORS } = ConfigManager.getValues();
    ctx.strokeStyle = COLORS.LIGHT_BLUE;
    ctx.beginPath();
    ctx.moveTo(0, referenceY);
    ctx.lineTo(canvas.width, referenceY);
    ctx.stroke();
  }

  function drawWithdrawCurve() {
    const { COLORS } = ConfigManager.getValues();
    // Draw curve using Catmull-Rom splines
    ctx.strokeStyle = COLORS.BLACK;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 === points.length ? i + 1 : i + 2];

      for (let t = 0; t < 1; t += 0.02) {
        const x = 0.5 * ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t * t +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t * t * t);
        const y = 0.5 * ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t * t +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t * t * t);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function plotPoints() {
    const { COLORS, MIN_WITHDRAW_PRCT, MAX_WITHDRAW_PRCT } = ConfigManager.getValues();

    points.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.font = '16px Arial';
    ctx.fillStyle = COLORS.BLACK;
    points.forEach(point => {
      const value = MIN_WITHDRAW_PRCT + ((xAxisPosition - point.y) / xAxisPosition) * (MAX_WITHDRAW_PRCT - MIN_WITHDRAW_PRCT);
      ctx.fillText(`${value.toFixed(2)}`, point.x - 20, point.y - 10);
    });
  }

  function calculateValueAtX(x) {
    // Find the two points that bound this x value
    let p1, p2;
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        p1 = points[i];
        p2 = points[i + 1];
        break;
      }
    }

    if (!p1 || !p2) return null;

    // Linear interpolation between points
    const t = (x - p1.x) / (p2.x - p1.x);
    const y = p1.y + t * (p2.y - p1.y);
    const { MAX_WITHDRAW_PRCT, MIN_WITHDRAW_PRCT } = ConfigManager.getValues();
    return MIN_WITHDRAW_PRCT + ((xAxisPosition - y) / xAxisPosition) * (MAX_WITHDRAW_PRCT - MIN_WITHDRAW_PRCT);
  }

  return {
    initialize,
    setDisplayMode: (mode) => {
      displayMode = mode;
      draw();
    },
    getPointsData: () => {
      return points.map(point => ({
        x: point.x,
        y: point.y
      }));
    },
    calculateValueAtX,
    getCanvasWidth: () => canvas.width
  };
})();

const DisplayModeSelector = (function () {
  let currentMode = 'year';

  function initialize() {
    const radioButtons = document.querySelectorAll('input[name="displayMode"]');
    radioButtons.forEach(radio => {
      radio.addEventListener('change', handleModeChange);
    });
  }

  function handleModeChange(e) {
    currentMode = e.target.value;
    SplineEditor.setDisplayMode(currentMode);
  }

  return {
    initialize,
    getCurrentMode: () => currentMode
  };
})();

const RatesTable = (function () {
  function initialize() {
    document.getElementById('getRatesButton')
      .addEventListener('click', generateTable);
  }

  function generateTable() {
    const tableContainer = document.getElementById('ratesTable');
    const { MIN_YEAR, MAX_YEAR, CURRENT_AGE, DISTANCE_FROM_EDGE } = ConfigManager.getValues();

    const years = [];
    for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
      years.push({
        year,
        planYear: year - MIN_YEAR + 1,
        age: CURRENT_AGE + (year - MIN_YEAR)
      });
    }

    const yearValues = years.map(yearData => {
      const fraction = (yearData.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);
      const x = DISTANCE_FROM_EDGE + fraction * (SplineEditor.getCanvasWidth() - 2 * DISTANCE_FROM_EDGE);
      const value = SplineEditor.calculateValueAtX(x);
      return {
        ...yearData,
        value: value.toFixed(2)
      };
    });

    renderTable(tableContainer, yearValues);
  }

  function renderTable(container, data) {
    const table = document.createElement('table');
    table.className = 'rates-table';

    // Add header
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th>Year</th>
      <th>Plan Year</th>
      <th>Age</th>
      <th>Withdrawal Rate (%)</th>
  `;
    table.appendChild(headerRow);

    // Add data rows
    data.forEach(({
      year,
      planYear,
      age,
      value
    }) => {
      const row = document.createElement('tr');
      row.innerHTML = `
          <td>${year}</td>
          <td>${planYear}</td>
          <td>${age}</td>
          <td>${value}</td>
      `;
      table.appendChild(row);
    });

    container.innerHTML = '';
    container.appendChild(table);
  }

  return {
    initialize
  };
})();

function main() {
  Settings.initialize();
  SplineEditor.initialize();
  DisplayModeSelector.initialize();
  RatesTable.initialize();
}

main();

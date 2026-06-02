# clawmo-terminal 📊

A sleek, high-performance, keyboard-driven stock analysis platform inspired by the Bloomberg Terminal. Built entirely using frontend web technologies (HTML, CSS, and JavaScript), this application runs directly in the browser to deliver real-time quantitative insights, technical charting, and market breadth data.

## Key Features

* **Keyboard-First Navigation:** Designed around terminal-style command lines and hotkeys to bypass the mouse entirely for lightning-fast workflows.
* **Real-Time Data Streams:** Direct frontend API integration to pull live stock quotes, historical price data, and options order flow.
* **Interactive Financial Charting:** Dynamic, responsive technical analysis charts supporting indicators like MACD, RSI, and Volume profiles.
* **Market Breadth Dashboards:** Multi-panel grid layout displaying market sentiment, advancing/declining stocks, and sectoral trends.
* **Custom Terminal Themes:** High-contrast CSS themes resembling classic dark-green/amber terminal aesthetics with responsive, windowed grids.

## Tech Stack

* **Structure:** Semantic HTML5
* **Styling:** Modern CSS (Flexbox, CSS Grid, custom properties for instant theme toggling)
* **Logic & Data Ingestion:** Native JavaScript (ES6+, Fetch API, Async/Await)
* **Charts (Optional - update if applicable):** Canvas API / Lightweight Charts (TradingView) / Chart.js

## Project Structure

```text
clawmo-terminal/
├── index.html          # Main application entry point & layout grid
├── assets/
│   ├── css/
│   │   └── style.css   # Terminal theme styles, layout, and animations
│   └── js/
│       ├── app.js      # Main controller, command parser, and event listeners
│       ├── api.js      # Fetch modules for market data (e.g., AlphaVantage, Polygon)
│       └── charts.js   # Canvas or library configuration for financial charts
├── config.example.js   # Template for local environment API keys
└── README.md

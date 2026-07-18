# clawmo-terminal 📊

A keyboard-driven, Bloomberg-style stock analysis terminal that runs entirely in your browser. No backend, no build step, no frameworks — just HTML, CSS, and vanilla JavaScript.

Professional market terminals cost tens of thousands of dollars a year. Free retail tools are mouse-driven, ad-heavy, and slow. clawmo-terminal fills the gap: clone it, add an API key, and get a fast, terminal-style workspace for real-time quotes, technical charting, and market breadth — for free.

> **Status:** Early-stage and under active development. Feedback, issues, and contributions are very welcome.

## Why clawmo-terminal?

- **Keyboard-first.** A command line and hotkeys drive everything. Type a ticker, hit a command, get your chart — no clicking through menus.
- **Zero infrastructure.** Pure frontend. Open `index.html` and you're running. No Node, no Docker, no server.
- **Real-time data.** Direct API integration for live quotes, historical prices, and options order flow (AlphaVantage / Polygon supported).
- **Serious charting.** Interactive technical analysis with MACD, RSI, and volume profiles.
- **Market breadth at a glance.** Multi-panel dashboards for sentiment, advancers/decliners, and sector trends.
- **Classic terminal aesthetics.** High-contrast dark-green/amber themes, instantly switchable via CSS custom properties.

## Quick Start

1. Clone the repo:
   ```bash
   git clone https://github.com/tonlone/clawmo-terminal.git
   cd clawmo-terminal
   ```
2. Copy the config template and add your API key(s):
   ```bash
   cp config.example.js config.js
   ```
   Get a free API key from [Alpha Vantage](https://www.alphavantage.co/support/#api-key) or [Polygon](https://polygon.io/).
3. Open `index.html` in your browser (or serve locally):
   ```bash
   npx serve .
   ```

That's it. Type a ticker symbol in the command bar to begin.

## Example Commands

| Command | Action |
|---|---|
| `AAPL` | Load quote and chart for Apple |
| `AAPL RSI` | Overlay RSI on the active chart |
| `BREADTH` | Open the market breadth dashboard |
| `THEME` | Toggle terminal color theme |

*(Adjust this table to match your actual command set.)*

## Project Structure

```
clawmo-terminal/
├── index.html          # Main application entry point & layout grid
├── assets/
│   ├── css/
│   │   └── style.css   # Terminal theme styles, layout, and animations
│   └── js/
│       ├── app.js      # Main controller, command parser, and event listeners
│       ├── api.js      # Fetch modules for market data (AlphaVantage, Polygon)
│       └── charts.js   # Chart rendering and indicator configuration
├── config.example.js   # Template for local API keys
└── README.md
```

## Tech Stack

- **Structure:** Semantic HTML5
- **Styling:** Modern CSS — Flexbox, Grid, custom properties for instant theming
- **Logic & data:** Native JavaScript (ES6+, Fetch API, async/await)
- **Charts:** Canvas API / Lightweight Charts

## Roadmap

- [ ] Expanded indicator library (Bollinger Bands, VWAP, moving average ribbons)
- [ ] Plugin-style data-source adapters beyond AlphaVantage/Polygon
- [ ] Watchlists and layout persistence
- [ ] Performance work on canvas rendering for large datasets
- [ ] Test coverage and contribution guide

## Contributing

Issues and pull requests are welcome. If you'd like to add a data-source adapter, an indicator, or a theme, open an issue first so we can discuss the approach.

## Disclaimer

clawmo-terminal is a research and educational tool. Nothing it displays is financial advice. Market data is provided by third-party APIs and may be delayed or inaccurate.

## License

MIT — see [LICENSE](LICENSE).

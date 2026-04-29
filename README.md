# Portfolio Pilot Prototype

A lightweight browser prototype for a personal investment tracker.

## What it includes

- Total portfolio chart
- Range filters: 1D, 1M, 3M, 1Y, ALL
- Percent view and dollar view
- Individual investment drill-down
- Demo accounts and holdings
- Local demo transaction controls
- Local persistence with `localStorage`

## How to run

Open `index.html` in a browser.

No build step is required.

## Notes

This is a frontend prototype with mock data. It does **not** connect to Robinhood, Fidelity, Coinbase, or any other brokerage yet.

A production version would likely add:

- user authentication
- real account connections or CSV imports
- a backend API
- a database for transactions, holdings, and snapshots
- performance calculations that separate market gains from deposits/withdrawals

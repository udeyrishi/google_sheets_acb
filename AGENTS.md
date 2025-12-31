# Repository Guidelines

## Project Context
This repo primarily serves as a backup for a Google Sheets Apps Script project used to calculate ACBs across transactions.
The data includes multiple non-registered accounts across brokers, including full and partial account transfers for bonuses, which is why the logic is account-aware.
The goal is to make the project more robust with tests and documentation while preserving the ability to paste code into the online `.gs` files for deployment.

## Project Structure & Module Organization
This repository contains a small Google Apps Script codebase for a Google Sheets finance tracker.
- `src/Code.js`: public spreadsheet functions (e.g., `ACB_UNIT`, `UNITS_OWNED`, `ASSET_REPORT`).
- `src/Aggregation.js`: aggregation and reducer logic for transaction effects.
- `src/Constants.js`: shared transaction type constants and lists.
- `src/Parser.js`: column parsing, transaction typing, and validation helpers.
- `src/*.test.js`: Jest tests colocated next to the source files they cover.

## Build, Test, and Development Commands
- Local tests run through Jest with zero runtime dependencies; Apps Script code stays plain `.js`.
- `yarn install`: install dev dependencies (Jest only).
- `yarn test`: run Jest against the Apps Script functions via a local harness.
- Development in Google Apps Script is still supported; copy these files into the online `.gs` project when deploying.

## Coding Style & Naming Conventions
- Indentation: follow the existing file style (current files mix 2- and 4-space indents).
- Public custom functions are uppercase with underscores (e.g., `ASSET_REPORT`).
- Internal helpers use a leading underscore (e.g., `_calculateAggregates`).
- Constants are `UPPER_SNAKE_CASE` (e.g., `_TRANSACTION_TYPE_SELL`).
- Use plain JavaScript (Apps Script runtime) without external dependencies.

## Testing Guidelines
- Jest tests sit alongside source files and import functions via conditional exports.
- Prefer small, targeted datasets to confirm calculations and error handling.
- When adding new transaction types, verify ordering, ACB changes, and error messages.
- Optionally validate changes by running custom functions in a Google Sheet.

## Commit & Pull Request Guidelines
Existing commits are short, descriptive sentences (e.g., “backup”, “remove fees for sale ACB”).
- Keep commit messages concise and action-oriented.
- PRs should include a brief description, example sheet inputs/outputs, and any behavior changes.
- Link related issues if they exist; screenshots are optional but helpful for sheet outputs.

## Security & Configuration Tips
- Do not commit sheet data or personally identifiable information.
- Validate column headers exactly match expected names (see `src/Parser.js`).

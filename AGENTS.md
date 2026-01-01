# Repository Guidelines

## Project Context
This repo primarily serves as a backup for a Google Sheets Apps Script project used to calculate ACBs across transactions.
The data includes multiple non-registered accounts across brokers, including full and partial account transfers for bonuses, which is why the logic is account-aware.
The goal is to make the project more robust with tests and documentation while preserving the ability to paste code into the online `.gs` files for deployment.

## Project Structure & Module Organization
This repository contains a small Google Apps Script codebase for a Google Sheets finance tracker.
- `src/main.ts`: public spreadsheet functions (e.g., `ACB_UNIT`, `UNITS_OWNED`, `ASSET_REPORT`). Exports from this file are exposed as GAS custom functions.
- `src/aggregation.ts`: aggregation and reducer logic for transaction effects.
- `src/constants.ts`: shared transaction type constants and lists.
- `src/parser.ts`: column parsing, transaction typing, and validation helpers.
- `src/*.test.ts`: Jest tests colocated next to the source files they cover.

## Code Organization Preference
- `src/main.ts` should stay a thin Apps Script integration layer (input/output glue only).
- Spreadsheet parsing belongs in `src/parser.ts`.
- Core math and business logic belongs in `src/aggregation.ts`.

## Build, Test, and Development Commands
- Local tests run through Jest + ts-jest in ESM mode; source is TypeScript.
- `yarn install`: install dev dependencies.
- `yarn test`: run Jest against the ESM TypeScript sources.
- `yarn build`: bundle `src/main.ts` with esbuild and emit `build/Code.gs`.
- Deploy by pasting `build/Code.gs` into the Apps Script editor.

## Build Pipeline Notes
- `scripts/build_gas.js` bundles `src/main.ts` with esbuild (`iife` output) and writes `build/Code.gs`.
- The build script parses `src/main.ts` with the TypeScript compiler to discover named exports.
- For each named export, it appends a top-level wrapper function so GAS recognizes custom functions.
- Only exports from `src/main.ts` are exposed to GAS; other module exports stay internal.

## Local vs GAS Execution
- Local Node/Jest: run TypeScript ESM directly; modules are imported via standard ESM syntax.
- GAS: uses the bundled `build/Code.gs`; only top-level wrapper functions are callable from Sheets.

## Coding Style & Naming Conventions
- Indentation: follow the existing file style (current files mix 2- and 4-space indents).
- Public custom functions are uppercase with underscores (e.g., `ASSET_REPORT`).
- Internal helpers use a leading underscore (e.g., `_calculateAggregates`).
- Constants are `UPPER_SNAKE_CASE` (e.g., `_TRANSACTION_TYPE_SELL`).
- Use TypeScript in `src/`; GAS receives bundled JS output.

## Testing Guidelines
- Jest tests sit alongside source files and import functions via ESM exports.
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
- Validate column headers exactly match expected names (see `src/parser.ts`).

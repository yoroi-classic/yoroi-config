# Yoroi Configuration Repository

This repository contains configuration files used by both the Yoroi Extension and Yoroi Mobile applications.

## Structure

- `dev.json`: Development remote configuration file.
- `prod.json`: Production remote configuration file.
- `bring-cashback-redirect-whitelist.json`: Redirect domain whitelist consumed by the Bring cashback integration.

## Usage

These configuration files are consumed by the Yoroi applications to manage various settings and parameters.

For the extension-first infrastructure migration, this repository is the owned source for remote configuration served from:

- `https://yoroi-config.blinklabs.cloud/dev.json`
- `https://yoroi-config.blinklabs.cloud/prod.json`
- `https://yoroi-config.blinklabs.cloud/bring-cashback-redirect-whitelist.json`

Optional services should remain disabled or pointed at owned endpoints until the corresponding Blink Labs infrastructure is available.

## Validation

Run `node scripts/validate-config-contract.js` before opening a PR. The contract check validates JSON parseability, expected dev/prod sections, dapp URL/origin formats, image references, Bring whitelist domains, and guards against legacy active service defaults.

## Guidelines for Changes

When proposing changes to the configuration files, please adhere to the following guidelines:

1.  **Pull Requests (PRs):** All changes must be submitted via a Pull Request.
2.  **Synchronization:** Ensure that any changes made to the configuration are reflected and compatible with both the Yoroi Extension and Yoroi Mobile applications. Changes in this repository should ideally be coordinated with corresponding application updates.
3.  **Schema Changes & Backward Compatibility:**
    *   If a schema change is necessary, **do not modify existing property names or their expected data types.**
    *   Instead, introduce new properties with different names to accommodate the new schema. This ensures backward compatibility for older versions of the Yoroi Extension and Mobile applications that may still be using the previous schema.
    *   Old properties can be deprecated but should not be removed until all active application versions have been updated to use the new schema.

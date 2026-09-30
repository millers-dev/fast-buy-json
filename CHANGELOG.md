# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-30

### Added

- Recovered baseline snapshot after local tree loss: JSON Schemas (`schemas/`), reconstructed OpenAPI (`openapi/fastbuyjson.yaml`), Node.js and Python demo APIs, reference MCP server, Postman collection, and schema validation CI.

### Changed

- Version labels aligned to **0.1.0** across packages, OpenAPI `info.version`, `/detect` (`standard` and `implementationVersion`), and MCP server metadata. Replaces premature **1.0.0** labels that did not match the recovered implementation maturity.

### Notes

- This release documents the restored reference implementation, not a finalized 1.0 protocol contract.

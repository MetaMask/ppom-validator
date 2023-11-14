# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.0]
### Uncategorized
- Remove floating promise from constructor ([#86](https://github.com/MetaMask/ppom-validator/pull/86))

## [0.10.0]
### Changed
- Fix PPOM initialisation in mobile ([#83](https://github.com/MetaMask/ppom-validator/pull/83))
- Instantiate PPOM per request ([#81](https://github.com/MetaMask/ppom-validator/pull/81))

## [0.9.0]
### Changed
- Performance Improvement: async instantation of PPOM instance by passing data files ([#77](https://github.com/MetaMask/ppom-validator/pull/77))
- Performance Improvement: async initialization on ppom padding wasm file after PPOMController is constructed ([#73](https://github.com/MetaMask/ppom-validator/pull/73))

## [0.8.0]
### Changed
- Create copy of providerRequestsCount to avoid returning instance variable from PPOMController ([#72](https://github.com/MetaMask/ppom-validator/pull/72))

## [0.7.0]
### Changed
- PPOM init should be called only once during initialisation ([#65](https://github.com/MetaMask/ppom-validator/pull/65))
- Fix syncing file metadata to remove old files ([#66](https://github.com/MetaMask/ppom-validator/pull/66))
- Record the number of times each RPC call is made ([#62](https://github.com/MetaMask/ppom-validator/pull/62))

## [0.6.0]
### Changed
- RPC payload fix ([#61](https://github.com/MetaMask/ppom-validator/pull/61))
- Using old data files for validation until new ones are fetched ([#51](https://github.com/MetaMask/ppom-validator/pull/51))
- Fix prefixing of hex value on chain id ([#50](https://github.com/MetaMask/ppom-validator/pull/50))

## [0.5.0]
### Changed
- Fix the check for ethereum mainnet and add hex prefix to chainId ([#48](https://github.com/MetaMask/ppom-validator/pull/48))

## [0.4.0]
### Changed
- PPOM should function only if user is on ethereum mainnet ([#46](https://github.com/MetaMask/ppom-validator/pull/46))
- Handle corruption of localstorage data files ([#44](https://github.com/MetaMask/ppom-validator/pull/44))

## [0.3.0]
### Changed
- Fix issue with fetching files the first time extension is installed ([#39](https://github.com/MetaMask/ppom-validator/pull/39))
- Fix url construction for fetching blockaid files from CDN ([#40](https://github.com/MetaMask/ppom-validator/pull/40))

## [0.2.0]
### Changed
- Adding code to verify signature of data blobs fetched from CDN ([#35](https://github.com/MetaMask/ppom-validator/pull/35))
- Rate limit requests to the provider ([#28](https://github.com/MetaMask/ppom-validator/pull/28))
- Validate path of data files ([#27](https://github.com/MetaMask/ppom-validator/pull/27))

## [0.1.2]
### Changed
- Change in way new ppom module is initialised ([#29](https://github.com/MetaMask/ppom-validator/pull/29))

## [0.1.1]
### Added
- Improvements in CDN data fetching ([#15](https://github.com/MetaMask/ppom-validator/pull/15))
- Mobile integration ([#14](https://github.com/MetaMask/ppom-validator/pull/14))
- Caching data for multiple networks ([#10](https://github.com/MetaMask/ppom-validator/pull/10))
- Adding periodic sync for ppom data ([#6](https://github.com/MetaMask/ppom-validator/pull/6))

## [0.0.1]
### Added
- Add PPOM middleware ([#5](https://github.com/MetaMask/ppom-validator/pull/5))
- Add PPOM controller ([#4](https://github.com/MetaMask/ppom-validator/pull/4))
- Add PPOM wasm code ([#3](https://github.com/MetaMask/ppom-validator/pull/3))
- Add storage class for PPOM data ([#1](https://github.com/MetaMask/ppom-validator/pull/1))
- Initialize the repo from https://github.com/MetaMask/metamask-module-template ([#2](https://github.com/MetaMask/ppom-validator/pull/2))

### Changed
- Restrict provider access to PPOM ([#7](https://github.com/MetaMask/ppom-validator/pull/7))
- Integrate with ppom npm module ([#8](https://github.com/MetaMask/ppom-validator/pull/8))

[Unreleased]: https://github.com/MetaMask/ppom-validator/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/MetaMask/ppom-validator/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/MetaMask/ppom-validator/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/MetaMask/ppom-validator/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/MetaMask/ppom-validator/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/MetaMask/ppom-validator/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/MetaMask/ppom-validator/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/MetaMask/ppom-validator/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MetaMask/ppom-validator/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MetaMask/ppom-validator/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MetaMask/ppom-validator/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/MetaMask/ppom-validator/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/MetaMask/ppom-validator/compare/v0.0.1...v0.1.1
[0.0.1]: https://github.com/MetaMask/ppom-validator/releases/tag/v0.0.1

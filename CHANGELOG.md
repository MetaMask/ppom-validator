# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.29.0]
### Changed
- Fix access to PPOM instance and wrap it in mutex lock ([#178](https://github.com/MetaMask/ppom-validator/pull/178))

## [0.28.0]
### Changed
- Fix writing files to storage ([#174](https://github.com/MetaMask/ppom-validator/pull/174))

## [0.27.0]
### Changed
- Support for new networks ([#161](https://github.com/MetaMask/ppom-validator/pull/161))

## [0.26.0]
### Changed
- Typing fixes in api interface ([#155](https://github.com/MetaMask/ppom-validator/pull/155))

## [0.25.0]
### Changed
- Download files and initialise PPOM when first transaction on network is received ([#151](https://github.com/MetaMask/ppom-validator/pull/151))
- Typing fixes for `provider`, `ppom` and other `any` usage ([#89](https://github.com/MetaMask/ppom-validator/pull/89))

## [0.24.0]
### Changed
- fix: delete all files fails when blockaid preference is disabled ([#148](https://github.com/MetaMask/ppom-validator/pull/148))

## [0.23.0]
### Changed
- Metadata should be synced for only active networks ([#146](https://github.com/MetaMask/ppom-validator/pull/146))
- Delete files from storage as blockaid preference is disabled ([#145](https://github.com/MetaMask/ppom-validator/pull/145))
- Remove dangling promises ([#136](https://github.com/MetaMask/ppom-validator/pull/136))

## [0.22.0]
### Changed
- Add option to use crypto implementation pass to the constructor ([#134](https://github.com/MetaMask/ppom-validator/pull/134))

## [0.21.0]
### Changed
- PPOMController fixes for mobile multichain ([#132](https://github.com/MetaMask/ppom-validator/pull/132))

## [0.20.0]
### Changed
- Add support for multiple chains ([#130](https://github.com/MetaMask/ppom-validator/pull/130))

## [0.19.0]
### Changed
- Reinitialise PPOM for new network on network change ([#127](https://github.com/MetaMask/ppom-validator/pull/127))

## [0.18.0]
### Changed
- Revert "Bump @metamask/base-controller from 3.2.3 to 4.0.1 (#117)" ([#117](https://github.com/MetaMask/ppom-validator/pull/117))

## [0.17.0]
### Changed
- Intialise PPOM only if user is on mainnet ([#121](https://github.com/MetaMask/ppom-validator/pull/121))

## [0.16.0]
### Changed
- Fix use of messenger in PPOMController ([#110](https://github.com/MetaMask/ppom-validator/pull/110))

## [0.15.0]
### Changed
- Cleanup and refactor method to get all files for a network ([#107](https://github.com/MetaMask/ppom-validator/pull/107))

## [0.14.0]
### Changed
- Add code changes to handle memory corruption ([#105](https://github.com/MetaMask/ppom-validator/pull/105))

## [0.13.0]
### Changed
- Refactoring and code cleanup in PPOMController ([#103](https://github.com/MetaMask/ppom-validator/pull/103))
- Start fetching files for mainnet as blockaid preference is enabled ([#102](https://github.com/MetaMask/ppom-validator/pull/102))
- PPOM instance to stay when user switch the network ([#101](https://github.com/MetaMask/ppom-validator/pull/101))

## [0.12.0]
### Changed
- Adding to callback to be invoked once ppom intialisation completes ([#98](https://github.com/MetaMask/ppom-validator/pull/98))
- PPOM instance should be kept in memory ([#96](https://github.com/MetaMask/ppom-validator/pull/96))
- Optimise validate signature ([#95](https://github.com/MetaMask/ppom-validator/pull/95))

## [0.11.0]
### Changed
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

[Unreleased]: https://github.com/MetaMask/ppom-validator/compare/v0.29.0...HEAD
[0.29.0]: https://github.com/MetaMask/ppom-validator/compare/v0.28.0...v0.29.0
[0.28.0]: https://github.com/MetaMask/ppom-validator/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/MetaMask/ppom-validator/compare/v0.26.0...v0.27.0
[0.26.0]: https://github.com/MetaMask/ppom-validator/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/MetaMask/ppom-validator/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/MetaMask/ppom-validator/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/MetaMask/ppom-validator/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/MetaMask/ppom-validator/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/MetaMask/ppom-validator/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/MetaMask/ppom-validator/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/MetaMask/ppom-validator/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/MetaMask/ppom-validator/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/MetaMask/ppom-validator/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/MetaMask/ppom-validator/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/MetaMask/ppom-validator/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/MetaMask/ppom-validator/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/MetaMask/ppom-validator/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/MetaMask/ppom-validator/compare/v0.11.0...v0.12.0
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

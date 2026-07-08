#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const failures = [];

const remoteConfigFiles = [
  {
    env: 'dev',
    file: 'dev.json',
    dappSections: ['dapps', 'dappsPreprod'],
  },
  {
    env: 'prod',
    file: 'prod.json',
    dappSections: ['dapps'],
  },
];

const requiredTopLevelKeys = [
  'pushLinkKeys',
  'banners',
  'popups',
  'features',
  'dapps',
  'swap',
  'enableTrezorAirdrop',
];

const requiredBannerKeys = [
  'midnightAnnouncement',
  'midnightPhase2Announcement',
  'yoroiDrep',
  'earnRewardsWithYoroi',
];

const requiredPopupKeys = [
  'midnightDistribution',
  'generalFeaturesAnnouncement',
  'poolTransitionDialog',
  'cardanoCardAnnouncement',
  'firefoxSupportAnnouncement',
  'stakingUpdate',
  'secondFiTeaser',
];

const requiredDappKeys = [
  'id',
  'name',
  'description',
  'category',
  'logo',
  'uri',
  'origins',
];

const urlLikeKeyPattern = /(?:url|uri|endpoint|baseurl|baseUrl|website)$/i;
const forbiddenActiveStringPatterns = [/emurgo/i];
const ownedHostnames = new Set(['yoroi-wallet.com', 'www.yoroi-wallet.com', 'yoroi-config.blinklabs.cloud']);
const ownedHostnameSuffixes = ['.blinklabs.cloud'];
const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const assetIdPattern = /^(?:\.|[0-9a-f]{56}\.(?:[0-9a-f]{2}){0,32})$/;
const domainPattern = /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function jsonPath(parts) {
  return '$' + parts.map(part => (typeof part === 'number' ? `[${part}]` : `.${part}`)).join('');
}

function fail(file, parts, message) {
  failures.push(`${file} ${jsonPath(parts)}: ${message}`);
}

function readJson(file) {
  const fullPath = path.join(rootDir, file);

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    failures.push(`${file}: failed to parse JSON: ${error.message}`);
    return undefined;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function requireRecord(file, value, parts) {
  if (!isRecord(value)) {
    fail(file, parts, 'must be an object');
    return false;
  }

  return true;
}

function requireArray(file, value, parts) {
  if (!Array.isArray(value)) {
    fail(file, parts, 'must be an array');
    return false;
  }

  return true;
}

function requireString(file, value, parts, options = {}) {
  const allowEmpty = options.allowEmpty === true;

  if (typeof value !== 'string') {
    fail(file, parts, 'must be a string');
    return false;
  }

  if (!allowEmpty && value.length === 0) {
    fail(file, parts, 'must not be empty');
    return false;
  }

  return true;
}

function requireBoolean(file, value, parts) {
  if (typeof value !== 'boolean') {
    fail(file, parts, 'must be a boolean');
    return false;
  }

  return true;
}

function requireKeys(file, record, parts, keys) {
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      fail(file, parts, `missing required key "${key}"`);
    }
  }
}

function requireHttpsUrl(file, value, parts) {
  if (!requireString(file, value, parts)) {
    return undefined;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    fail(file, parts, 'must be a valid URL');
    return undefined;
  }

  if (url.protocol !== 'https:') {
    fail(file, parts, 'must use https');
  }

  return url;
}

function requireOwnedOrLocalUrl(file, value, parts) {
  if (!requireString(file, value, parts)) {
    return undefined;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    fail(file, parts, 'must be a valid URL');
    return undefined;
  }

  const isLocal = file === 'dev.json' && localHostnames.has(url.hostname);

  if (!isLocal && url.protocol !== 'https:') {
    fail(file, parts, 'must use https unless dev.json points at a local development host');
  }

  if (!isLocal && !isOwnedHostname(url.hostname)) {
    fail(file, parts, 'must point at an owned domain or an explicit local development host');
  }

  return url;
}

function isOwnedHostname(hostname) {
  return ownedHostnames.has(hostname) || ownedHostnameSuffixes.some(suffix => hostname.endsWith(suffix));
}

function validateRemoteConfig({ env, file, dappSections }) {
  const config = readJson(file);

  if (!requireRecord(file, config, [])) {
    return;
  }

  requireKeys(file, config, [], requiredTopLevelKeys);

  if (env === 'dev' && !hasOwn(config, 'dappsPreprod')) {
    fail(file, [], 'missing required preprod dapp section for development config');
  }

  validatePushLinkKeys(file, config.pushLinkKeys);
  validateBanners(file, config.banners);
  validatePopups(file, config.popups);
  validateFeatures(file, config.features);

  for (const section of dappSections) {
    validateDappSection(file, section, config[section]);
  }

  validateSwap(file, config.swap);
  requireBoolean(file, config.enableTrezorAirdrop, ['enableTrezorAirdrop']);
  validateOwnedRuntimeUrls(file, config);
  validateNoForbiddenActiveStrings(file, config);
}

function validatePushLinkKeys(file, pushLinkKeys) {
  if (!requireRecord(file, pushLinkKeys, ['pushLinkKeys'])) {
    return;
  }

  const internal = pushLinkKeys.internal;
  const external = pushLinkKeys.external;

  if (requireRecord(file, internal, ['pushLinkKeys', 'internal'])) {
    const catalystRegistration = internal.catalystRegistration;

    if (requireRecord(file, catalystRegistration, ['pushLinkKeys', 'internal', 'catalystRegistration'])) {
      requireString(file, catalystRegistration.mobile, ['pushLinkKeys', 'internal', 'catalystRegistration', 'mobile']);
      requireString(file, catalystRegistration.extension, ['pushLinkKeys', 'internal', 'catalystRegistration', 'extension']);

      if (typeof catalystRegistration.extension === 'string' && !catalystRegistration.extension.startsWith('/')) {
        fail(file, ['pushLinkKeys', 'internal', 'catalystRegistration', 'extension'], 'must be an extension-relative path');
      }
    }
  }

  if (requireRecord(file, external, ['pushLinkKeys', 'external'])) {
    requireOwnedOrLocalUrl(file, external.yoroiWebsite, ['pushLinkKeys', 'external', 'yoroiWebsite']);
  }
}

function validateBanners(file, banners) {
  if (!requireRecord(file, banners, ['banners'])) {
    return;
  }

  requireKeys(file, banners, ['banners'], requiredBannerKeys);

  for (const key of requiredBannerKeys) {
    if (requireRecord(file, banners[key], ['banners', key])) {
      requireBoolean(file, banners[key].display, ['banners', key, 'display']);
    }
  }

  const earnRewards = banners.earnRewardsWithYoroi;

  if (isRecord(earnRewards)) {
    requireString(file, earnRewards.poolId, ['banners', 'earnRewardsWithYoroi', 'poolId'], { allowEmpty: true });
    requireString(file, earnRewards.poolName, ['banners', 'earnRewardsWithYoroi', 'poolName'], { allowEmpty: true });
    requireString(file, earnRewards.drepId, ['banners', 'earnRewardsWithYoroi', 'drepId'], { allowEmpty: true });

    if (earnRewards.display === true) {
      for (const key of ['poolId', 'poolName', 'drepId']) {
        if (typeof earnRewards[key] === 'string' && earnRewards[key].length === 0) {
          fail(file, ['banners', 'earnRewardsWithYoroi', key], 'must not be empty when the banner is displayed');
        }
      }
    }
  }
}

function validatePopups(file, popups) {
  if (!requireRecord(file, popups, ['popups'])) {
    return;
  }

  requireKeys(file, popups, ['popups'], requiredPopupKeys);

  for (const key of requiredPopupKeys) {
    if (requireRecord(file, popups[key], ['popups', key])) {
      requireBoolean(file, popups[key].display, ['popups', key, 'display']);
    }
  }

  const stakingUpdate = popups.stakingUpdate;

  if (isRecord(stakingUpdate) && requireArray(file, stakingUpdate.affectedPools, ['popups', 'stakingUpdate', 'affectedPools'])) {
    stakingUpdate.affectedPools.forEach((pool, index) => {
      requireString(file, pool, ['popups', 'stakingUpdate', 'affectedPools', index]);
    });

    if (stakingUpdate.display === true && stakingUpdate.affectedPools.length === 0) {
      fail(file, ['popups', 'stakingUpdate', 'affectedPools'], 'must not be empty when the popup is displayed');
    }
  }
}

function validateFeatures(file, features) {
  if (!requireRecord(file, features, ['features'])) {
    return;
  }

  if (requireRecord(file, features.midnightAirdrop, ['features', 'midnightAirdrop'])) {
    requireBoolean(file, features.midnightAirdrop.enabled, ['features', 'midnightAirdrop', 'enabled']);
  }
}

function validateDappSection(file, section, dapps) {
  const sectionPath = [section];

  if (!requireRecord(file, dapps, sectionPath)) {
    return;
  }

  requireKeys(file, dapps, sectionPath, ['recommended', 'filters']);

  if (section === 'dapps') {
    requireKeys(file, dapps, sectionPath, ['banned']);

    if (requireArray(file, dapps.banned, [...sectionPath, 'banned'])) {
      dapps.banned.forEach((id, index) => {
        requireString(file, id, [...sectionPath, 'banned', index]);
      });
    }
  }

  if (requireArray(file, dapps.recommended, [...sectionPath, 'recommended'])) {
    if (dapps.recommended.length === 0) {
      fail(file, [...sectionPath, 'recommended'], 'must not be empty');
    }

    dapps.recommended.forEach((dapp, index) => validateDapp(file, dapp, [...sectionPath, 'recommended', index]));
  }

  validateDappFilters(file, dapps.filters, [...sectionPath, 'filters']);
}

function validateDapp(file, dapp, parts) {
  if (!requireRecord(file, dapp, parts)) {
    return;
  }

  requireKeys(file, dapp, parts, requiredDappKeys);

  for (const key of ['id', 'name', 'description', 'category', 'logo']) {
    requireString(file, dapp[key], [...parts, key]);
  }

  if (typeof dapp.id === 'string' && !/^[a-z0-9][a-z0-9_-]*$/.test(dapp.id)) {
    fail(file, [...parts, 'id'], 'must use a stable lowercase id');
  }

  validateLogoReference(file, dapp.logo, [...parts, 'logo']);

  requireHttpsUrl(file, dapp.uri, [...parts, 'uri']);

  if (requireArray(file, dapp.origins, [...parts, 'origins'])) {
    if (dapp.origins.length === 0) {
      fail(file, [...parts, 'origins'], 'must not be empty');
    }

    dapp.origins.forEach((origin, index) => validateOrigin(file, origin, [...parts, 'origins', index]));
  }

  if (hasOwn(dapp, 'isSingleAddress')) {
    requireBoolean(file, dapp.isSingleAddress, [...parts, 'isSingleAddress']);
  }
}

function validateLogoReference(file, logo, parts) {
  if (!requireString(file, logo, parts)) {
    return;
  }

  if (logo.includes('/') || logo.includes('\\') || logo.includes('..')) {
    fail(file, parts, 'must be a file name in the images directory');
    return;
  }

  if (!fs.existsSync(path.join(rootDir, 'images', logo))) {
    fail(file, parts, 'must reference an existing file in images/');
  }
}

function validateOrigin(file, value, parts) {
  const url = requireHttpsUrl(file, value, parts);

  if (url === undefined) {
    return;
  }

  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    fail(file, parts, 'must be an origin without path, query, or hash');
  }
}

function validateDappFilters(file, filters, parts) {
  if (!requireRecord(file, filters, parts)) {
    return;
  }

  for (const [filter, categories] of Object.entries(filters)) {
    if (!requireArray(file, categories, [...parts, filter])) {
      continue;
    }

    if (categories.length === 0) {
      fail(file, [...parts, filter], 'must not be empty');
    }

    categories.forEach((category, index) => {
      requireString(file, category, [...parts, filter, index]);
    });
  }
}

function validateSwap(file, swap) {
  if (!requireRecord(file, swap, ['swap'])) {
    return;
  }

  requireKeys(file, swap, ['swap'], ['initialPair', 'excludedTokens', 'verifiedTokens', 'partners']);

  if (requireRecord(file, swap.initialPair, ['swap', 'initialPair'])) {
    validateAssetId(file, swap.initialPair.tokenIn, ['swap', 'initialPair', 'tokenIn']);
    validateAssetId(file, swap.initialPair.tokenOut, ['swap', 'initialPair', 'tokenOut']);
  }

  for (const key of ['excludedTokens', 'verifiedTokens']) {
    if (requireArray(file, swap[key], ['swap', key])) {
      swap[key].forEach((assetId, index) => validateAssetId(file, assetId, ['swap', key, index]));
    }
  }

  if (requireRecord(file, swap.partners, ['swap', 'partners'])) {
    for (const [partner, value] of Object.entries(swap.partners)) {
      requireString(file, value, ['swap', 'partners', partner]);
    }
  }
}

function validateAssetId(file, value, parts) {
  if (!requireString(file, value, parts)) {
    return;
  }

  if (!assetIdPattern.test(value)) {
    fail(file, parts, 'must be "." for ADA or a lowercase policy.asset hex id with a 0-32 byte asset name');
  }
}

function validateOwnedRuntimeUrls(file, value, parts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateOwnedRuntimeUrls(file, item, [...parts, index]));
    return;
  }

  if (!isRecord(value)) {
    if (typeof value === 'string' && isUrlLike(parts, value) && !isDappRecommendationPath(parts)) {
      requireOwnedOrLocalUrl(file, value, parts);
    }

    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    validateOwnedRuntimeUrls(file, nestedValue, [...parts, key]);
  }
}

function isUrlLike(parts, value) {
  const key = parts[parts.length - 1];
  return /^https?:\/\//i.test(value) || (typeof key === 'string' && urlLikeKeyPattern.test(key));
}

function isDappRecommendationPath(parts) {
  return (
    (parts[0] === 'dapps' || parts[0] === 'dappsPreprod') &&
    parts[1] === 'recommended'
  );
}

function validateNoForbiddenActiveStrings(file, value, parts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoForbiddenActiveStrings(file, item, [...parts, index]));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      validateNoForbiddenActiveStrings(file, nestedValue, [...parts, key]);
    }

    return;
  }

  if (typeof value !== 'string') {
    return;
  }

  for (const pattern of forbiddenActiveStringPatterns) {
    if (pattern.test(value)) {
      fail(file, parts, 'must not reference legacy active EMURGO service defaults');
    }
  }
}

function validateBringWhitelist() {
  const file = 'bring-cashback-redirect-whitelist.json';
  const whitelist = readJson(file);

  if (!requireArray(file, whitelist, [])) {
    return;
  }

  if (whitelist.length === 0) {
    fail(file, [], 'must not be empty');
  }

  const seen = new Set();

  whitelist.forEach((entry, index) => {
    const parts = [index];

    if (!requireString(file, entry, parts)) {
      return;
    }

    if (!domainPattern.test(entry)) {
      fail(file, parts, 'must be a domain or wildcard domain without protocol or path');
    }

    const normalized = entry.toLowerCase();

    if (seen.has(normalized)) {
      fail(file, parts, 'must not duplicate another whitelist entry');
    }

    seen.add(normalized);
  });
}

for (const configFile of remoteConfigFiles) {
  validateRemoteConfig(configFile);
}

validateBringWhitelist();

if (failures.length > 0) {
  console.error('Config contract validation failed:');
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log('Config contract validation passed.');

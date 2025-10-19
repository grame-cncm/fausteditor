function parseItem(item_key) {
    const raw = localStorage.getItem(item_key);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            const migrated = Object.fromEntries(parsed);
            localStorage.setItem(item_key, JSON.stringify(migrated));
            return migrated;
        }
        if (parsed && typeof parsed === "object") {
            return parsed;
        }
    } catch (error) {
        console.warn(`Failed to parse localStorage entry "${item_key}":`, error);
    }

    return null;
}

function ensureItemObject(item_key) {
    return parseItem(item_key) ?? {};
}

// Retrieve a saved value from local storage for the given composite key.
export function getStorageItemValue(item_key, key) {
    const item = parseItem(item_key);
    if (!item) {
        return null;
    }
    return Object.prototype.hasOwnProperty.call(item, key) ? item[key] : null;
}

// Persist a value tied to the composite key, skipping writes when the value is unchanged.
export function setStorageItemValue(item_key, key, value) {
    const item = ensureItemObject(item_key);
    if (Object.prototype.hasOwnProperty.call(item, key) && item[key] === value) {
        return;
    }
    item[key] = value;
    localStorage.setItem(item_key, JSON.stringify(item));
}

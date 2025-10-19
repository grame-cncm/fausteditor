/**
 * @fileoverview Utility functions for interacting with `localStorage`.
 *
 * Provides a simple key-value store interface (`getStorageItemValue`, `setStorageItemValue`)
 * that abstracts the underlying storage mechanism. It stores data as JSON objects
 * under a main key (e.g., 'FaustLibTester'), allowing for nested properties.
 *
 * This module also includes logic to automatically migrate legacy array-based
 * storage formats to the current object-based format upon first read.
 */

/**
 * Parses a JSON object stored in localStorage under a specific key.
 * It handles migration for legacy array-based storage, converting it to an object.
 * Returns null if the item doesn't exist or if parsing fails.
 *
 * @param {string} item_key The top-level key in localStorage.
 * @returns {Record<string, any> | null} The parsed object or null.
 */
function parseItem(item_key) {
    const raw = localStorage.getItem(item_key);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        // Handle legacy migration: old format was an array of [key, value] pairs
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

    // Return null if parsing failed or data is not a valid object
    return null;
}

/**
 * Ensures that a valid object exists for the given localStorage key.
 * If the item exists and is valid, it's returned.
 * If not, an empty object is returned.
 *
 * @param {string} item_key The top-level key in localStorage.
 * @returns {Record<string, any>} The existing object or a new empty object.
 */
function ensureItemObject(item_key) {
    return parseItem(item_key) ?? {};
}

/**
 * Retrieve a saved value from local storage for a given composite key.
 * This reads a top-level object (item_key) and returns a specific property (key) from it.
 *
 * @param {string} item_key The top-level key in localStorage (e.g., 'FaustLibTester').
 * @param {string} key The specific property key within the top-level object.
 * @returns {any | null} The stored value, or null if the item or key doesn't exist.
 */
export function getStorageItemValue(item_key, key) {
    const item = parseItem(item_key);
    if (!item) {
        return null;
    }
    // Use hasOwnProperty to avoid retrieving properties from the prototype chain.
    return Object.prototype.hasOwnProperty.call(item, key) ? item[key] : null;
}

/**
 * Persist a value tied to a composite key (item_key -> key).
 * It skips writing to localStorage if the value is unchanged to avoid unnecessary I/O.
 *
 * @param {string} item_key The top-level key in localStorage (e.g., 'FaustLibTester').
 * @param {string} key The specific property key to set within the top-level object.
 * @param {any} value The value to store.
 */
export function setStorageItemValue(item_key, key, value) {
    // Get the existing object or a new one if it doesn't exist.
    const item = ensureItemObject(item_key);

    // Avoid unnecessary writes if the value is already set and identical.
    if (Object.prototype.hasOwnProperty.call(item, key) && item[key] === value) {
        return;
    }

    // Set the new value and stringify the entire object back into localStorage.
    item[key] = value;
    localStorage.setItem(item_key, JSON.stringify(item));
}
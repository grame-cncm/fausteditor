//set item from local storage 'item_key' key
export function getStorageItemValue(item_key, key) {
    if (localStorage.getItem(item_key)) {
        var item_value = JSON.parse(localStorage.getItem(item_key));
        var item_index = item_value.findIndex((obj => obj[0] === key));
        return (item_index >= 0) ? item_value[item_index][1] : null;
    } else {
        return null;
    }
}

//get [key, value] in local storage item_key key
export function setStorageItemValue(item_key, key, value) {
    var item_value;
    if (localStorage.getItem(item_key)) {
        item_value = JSON.parse(localStorage.getItem(item_key));
    } else {
        item_value = [];
    }

    // Possibly update an existing 'key'
    var item_index = item_value.findIndex((obj => obj[0] === key));
    if (item_index >= 0) {
        item_value[item_index][1] = value;
        // Otherwise push a new [key, value]
    } else {
        item_value.push([key, value]);
    }

    localStorage.setItem(item_key, JSON.stringify(item_value));
}


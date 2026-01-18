// Aegis Quick Share - Background Service Worker

const APP_ORIGIN = 'https://aegis-e31n.onrender.com';
const DASHBOARD_URL = `${APP_ORIGIN}/dashboard/social`;

/**
 * Dispatches a custom share intent event to the Aegis tab and triggers auto-paste
 * @param {string} url - The URL to share
 */
function dispatchShareIntent(url) {
    // Dispatch the share intent event
    window.dispatchEvent(new CustomEvent('AEGIS_SHARE_INTENT', {
        detail: { url }
    }));

    // Small delay to let the page handle the event, then simulate paste
    setTimeout(() => {
        // Find the active input or focused element and simulate paste
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            // For React controlled inputs, we need to set value and dispatch input event
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                activeElement.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
                'value'
            ).set;
            nativeInputValueSetter.call(activeElement, url);

            // Dispatch input event to trigger React's onChange
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // Dispatch a paste event with the URL data
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData.setData('text/plain', url);
            document.dispatchEvent(pasteEvent);
        }
    }, 100);
}

/**
 * Copies text to clipboard via content script injection
 * @param {string} text - The text to copy
 * @param {number} tabId - The tab ID to execute in
 */
async function copyToClipboard(text, tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (textToCopy) => {
                navigator.clipboard.writeText(textToCopy);
            },
            args: [text]
        });
        console.log('Aegis Quick Share: URL copied to clipboard');
    } catch (error) {
        console.error('Aegis Quick Share: Failed to copy to clipboard', error);
    }
}

/**
 * Main action handler for sharing a URL
 * @param {chrome.tabs.Tab} tab - The tab to share from
 */
async function handleShareAction(tab) {
    // Get the current tab's URL
    const currentUrl = tab.url;

    // Don't share chrome:// or extension pages
    if (!currentUrl || currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://')) {
        console.warn('Aegis Quick Share: Cannot share this page type');
        return;
    }

    // Auto-copy URL to clipboard
    await copyToClipboard(currentUrl, tab.id);

    try {
        // Check if an Aegis tab is already open
        const aegisTabs = await chrome.tabs.query({ url: `${APP_ORIGIN}/*` });

        if (aegisTabs.length > 0) {
            // Aegis is OPEN: Focus the existing tab and dispatch the share event
            const aegisTab = aegisTabs[0];

            // Focus the Aegis tab
            await chrome.tabs.update(aegisTab.id, { active: true });

            // Also focus the window containing the tab
            await chrome.windows.update(aegisTab.windowId, { focused: true });

            // Execute script to dispatch the custom event
            await chrome.scripting.executeScript({
                target: { tabId: aegisTab.id },
                func: dispatchShareIntent,
                args: [currentUrl]
            });

            console.log('Aegis Quick Share: Dispatched share intent to existing tab');
        } else {
            // Aegis is CLOSED: Open a new tab with the share URL as a query parameter
            const shareUrl = `${DASHBOARD_URL}?share_url=${encodeURIComponent(currentUrl)}`;

            await chrome.tabs.create({ url: shareUrl });

            console.log('Aegis Quick Share: Opened new Aegis tab with share URL');
        }
    } catch (error) {
        console.error('Aegis Quick Share: Error during share action', error);
    }
}

/**
 * Handles the extension icon click action
 */
chrome.action.onClicked.addListener(handleShareAction);


window.downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

window.triggerFileInputClick = (element) => {
    element.click();
};

window.applyDynamicScale = () => {
    const container = document.querySelector('.karel-area-wrapper');
    const area = document.querySelector('.karel-area');

    if (!container || !area) {
        return;
    }

    // Přirozená šířka tabulky – tuto hodnotu můžete nastavit např. jako fixní hodnotu, pokud víte, že tabulka má být třeba 600px
    const naturalWidth = 600; // případně mějte uloženou tuto hodnotu jinde

    // Zjistíme dostupnou šířku rodiče
    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight;

    // Spočítáme scale faktor
    const scaleFactorW = availableWidth / naturalWidth;
    const scaleFactorH = availableHeight / naturalWidth;

    const scaleFactor = (scaleFactorW > scaleFactorH) ? scaleFactorH : scaleFactorW;

    // Nastavíme transform pro škálování
    //area.style.transform = `scale(${scaleFactor})`;
    area.style.zoom = `${scaleFactor}`;
};

// Můžeme použít ResizeObserver, nebo poslouchat událost 'resize'
window.addEventListener('resize', window.applyDynamicScale);
window.addEventListener('load', window.applyDynamicScale);
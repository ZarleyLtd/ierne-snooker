// SVG map fix - Replaces SVG use elements with inline SVG content
(function() {
    if (!window.svgMap) return;
    
    var allItems = document.querySelectorAll('use');

    for (var i = 0; i < allItems.length; i++) {
        var item = allItems[i];
        var href = item.getAttribute('xlink:href') || item.getAttribute('href');
        if (!href || !href.includes('#')) continue;
        
        var anchor = '#' + href.split('#')[1];
        var itemData = window.svgMap[anchor];

        if(!itemData) {
            continue;
        }

        var svgItem = item.parentNode;
        svgItem.innerHTML = itemData.content;
        svgItem.setAttribute('viewBox', itemData.viewbox);
    }
})();
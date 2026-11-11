export function installWheelZoom(container, browser, onError = console.error) {
  let timer, pending;

  function flush() {
    timer = undefined;
    const gesture = pending;
    pending = undefined;
    if (!gesture || !browser.referenceFrameList.includes(gesture.frame)) return;
    const {frame, fraction, pixels} = gesture;
    const width = browser.calculateViewportWidth(browser.referenceFrameList.length);
    const span = width * frame.bpPerPixel;
    const factor = Math.exp(Math.max(-0.7, Math.min(0.7, pixels * 0.003)));
    const nextSpan = factor < 1
      ? Math.max(span * factor, browser.minimumBases())
      : Math.min(span * factor, frame.getChromosome().bpLength);
    if (nextSpan === span) return;
    const anchor = frame.start + fraction * span;
    const center = anchor + (0.5 - fraction) * nextSpan;
    Promise.resolve(browser.zoomWithScaleFactor(factor, center, frame)).catch(onError);
  }

  function wheel(event) {
    if (event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const path = event.composedPath();
    const viewport = browser.trackViews.flatMap(view => view.viewports)
      .find(viewport => path.includes(viewport.viewportElement));
    const frame = viewport?.referenceFrame;
    if (!frame || frame.chr === 'all' || !Number.isFinite(frame.bpPerPixel) || browser.config.disableZoom) return;
    const bounds = viewport.viewportElement.getBoundingClientRect();
    if (bounds.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
    pending = {frame, fraction, pixels: pixels + (pending?.frame === frame ? pending.pixels : 0)};
    if (timer === undefined) timer = setTimeout(flush, 50);
  }

  container.addEventListener('wheel', wheel, {capture:true, passive:false});
  return () => { clearTimeout(timer); container.removeEventListener('wheel', wheel, {capture:true}); };
}

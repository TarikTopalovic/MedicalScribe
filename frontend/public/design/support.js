// Offline bootstrap for the unmodified Design Canvas export. The original
// runtime looks for window.React and window.ReactDOM before it boots.
document.write('<script src="./react.production.min.js"><\/script>');
document.write('<script src="./react-dom.production.min.js"><\/script>');
document.write('<script src="./support.runtime.js"><\/script>');

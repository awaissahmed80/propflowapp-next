/* PropFlow lead form embed.
   <div data-propflow-form="my-workspace/frm-0001"></div>
   <script src="https://campaigns.propflowapp.test/embed.js" async></script>
   Replaces each placeholder with the hosted form in an iframe that sizes itself (loaded lazily).
   The page's utm_* tags are passed on so the lead gets the right channel. */
;(function () {
  var script = document.currentScript
  if (!script || !script.src) {
    var tags = document.querySelectorAll('script[src*="/embed.js"]')
    script = tags[tags.length - 1]
  }
  if (!script) return
  var origin = new URL(script.src, window.location.href).origin
  var query = new URLSearchParams(window.location.search)

  function mount(el) {
    if (el.getAttribute("data-propflow-mounted")) return
    var ref = String(el.getAttribute("data-propflow-form") || "")
      .trim()
      .toLowerCase()
    var parts = ref.split("/")
    if (parts.length !== 2 || !parts[0] || !parts[1]) return
    el.setAttribute("data-propflow-mounted", "1")
    var params = new URLSearchParams({ embed: "1" })
    query.forEach(function (v, k) {
      if (k.indexOf("utm_") === 0) params.set(k, v)
    })
    var frame = document.createElement("iframe")
    frame.src = origin + "/f/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts[1]) + "?" + params.toString()
    frame.title = "Enquiry form"
    frame.loading = "lazy"
    frame.setAttribute("allowtransparency", "true")
    frame.style.cssText = "width:100%;min-height:420px;border:0;display:block;background:transparent;color-scheme:light"
    frame.setAttribute("data-propflow-frame", parts[1])
    el.appendChild(frame)
  }

  // The form reports its height; only trust messages from the forms' own address
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== "propflow:form-height") return
    var id = String(e.data.formId || "").toLowerCase()
    var frames = document.querySelectorAll("iframe[data-propflow-frame]")
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].getAttribute("data-propflow-frame") !== id || frames[i].contentWindow !== e.source) continue
      frames[i].style.minHeight = "0"
      frames[i].style.height = Number(e.data.height) + 8 + "px"
    }
  })

  function run() {
    var els = document.querySelectorAll("[data-propflow-form]")
    for (var i = 0; i < els.length; i++) mount(els[i])
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run)
  else run()
})()

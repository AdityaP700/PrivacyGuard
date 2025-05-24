document.addEventListener("DOMContentLoaded", function () {
  const toggleBtn = document.getElementById("toggleBtn");
  const details = document.getElementById("details");

  toggleBtn.addEventListener("click", () => {
    if (details.style.display === "none") {
      details.style.display = "block";
      toggleBtn.textContent = "Show Less";
    } else {
      details.style.display = "none";
      toggleBtn.textContent = "Show More";
    }
  });

  document.getElementById("safeBtn").addEventListener("click", () => {
    alert("Site marked as safe!");
  });

  document.getElementById("proceedBtn").addEventListener("click", () => {
    alert("Proceeding to site...");
  });

  document.getElementById("blockBtn").addEventListener("click", () => {
    alert("Site blocked.");
  });
});

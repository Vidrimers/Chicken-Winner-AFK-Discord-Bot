// Copy command to clipboard
function copyCmd(el) {
  navigator.clipboard.writeText(el.textContent).then(() => {
    const toast = document.getElementById('copyToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1200);
  });
}

// Clear search
function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  document.getElementById('searchInput').dispatchEvent(new Event('input'));
}

// Accordion toggle
function toggleAcc(header) {
  header.classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}

// Search — filter blocks
const searchInput = document.getElementById('searchInput');
const contentEl = document.getElementById('content');
const searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', function() {
  searchClear.style.display = this.value ? 'block' : 'none';
  const query = this.value.trim().toLowerCase();
  const blocks = contentEl.querySelectorAll('h2, h3, h4, table, .cmd-block, .info, .warn, ul, ol, p');

  if (query.length < 2) {
    blocks.forEach(b => b.style.display = '');
    return;
  }

  blocks.forEach(b => b.style.display = 'none');

  blocks.forEach(block => {
    const text = block.textContent.toLowerCase();
    if (text.includes(query)) {
      block.style.display = '';
      let prev = block.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'H1' || prev.tagName === 'H2' || prev.tagName === 'H3' || prev.tagName === 'H4') {
          prev.style.display = '';
          break;
        }
        prev = prev.previousElementSibling;
      }
    }
  });

  contentEl.querySelector('h1').style.display = '';
  contentEl.querySelector('.subtitle').style.display = '';
  contentEl.querySelector('.search-wrap').style.display = '';
});

// Active sidebar link on scroll
const sections = document.querySelectorAll('[id^="s"], [id^="cat-"]');
const sidebarLinks = document.querySelectorAll('.sidebar a[href^="#"]');
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      sidebarLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.sidebar a[href="#${entry.target.id}"]`);
      if (link) link.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });
sections.forEach(s => observer.observe(s));

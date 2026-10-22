const diagram=document.querySelector('.diagram-scroll');
document.querySelectorAll('[data-highlight]').forEach(button=>button.addEventListener('click',()=>{diagram.dataset.focus=button.dataset.highlight;document.querySelectorAll('[data-highlight]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));}));
document.querySelector('#changed-only').addEventListener('change',event=>{document.querySelectorAll('.comparison-table tr[data-same]').forEach(row=>row.hidden=event.target.checked);});
function revealEvidence(){const target=document.getElementById(location.hash.slice(1));if(target?.matches('details'))target.open=true;}
window.addEventListener('hashchange',revealEvidence);revealEvidence();
const links=[...document.querySelectorAll('aside nav a')];const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){links.forEach(link=>link.classList.toggle('active',link.hash==='#'+entry.target.id));}},{rootMargin:'-10% 0px -65% 0px'});document.querySelectorAll('.article-body>section').forEach(section=>observer.observe(section));

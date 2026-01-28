// Simple fade-in animations with CSS
document.addEventListener('DOMContentLoaded', () => {
  // Add staggered animation delays to feature cards
  const featureCards = document.querySelectorAll('.feature-card');
  featureCards.forEach((card, index) => {
    card.style.animation = `fadeIn 0.6s ease-out ${0.8 + (index * 0.15)}s both`;
  });

  // Add hover effect to buttons
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    button.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
    });
    
    button.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
    });
  });
});
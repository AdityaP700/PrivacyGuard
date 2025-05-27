 class PrivacyGuardUI {
      constructor() {
        this.initializeElements();
        this.bindEvents();
        this.initializeAnimations();
      }

      initializeElements() {
        this.toggleBtn = document.getElementById('toggleBtn');
        this.details = document.getElementById('details');
        this.safeBtn = document.getElementById('safeBtn');
        this.proceedBtn = document.getElementById('proceedBtn');
        this.blockBtn = document.getElementById('blockBtn');
        this.infoBtn = document.getElementById('infoBtn');
      }

      bindEvents() {
        this.toggleBtn.addEventListener('click', () => this.toggleDetails());
        this.safeBtn.addEventListener('click', () => this.handleAction('safe', 'Site added to safe list'));
        this.proceedBtn.addEventListener('click', () => this.handleAction('proceed', 'Proceeding to site...'));
        this.blockBtn.addEventListener('click', () => this.handleAction('block', 'Site blocked successfully'));
        this.infoBtn.addEventListener('click', () => this.handleAction('info', 'More information displayed'));
      }

      initializeAnimations() {
        // Stagger animation for alert cards
        const cards = document.querySelectorAll('.alert-card');
        cards.forEach((card, index) => {
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, index * 100);
        });
      }

      toggleDetails() {
        const isExpanded = this.details.classList.contains('show');
        
        if (isExpanded) {
          this.details.classList.remove('show');
          this.toggleBtn.textContent = 'Learn How It Works';
          this.toggleBtn.classList.remove('expanded');
        } else {
          this.details.classList.add('show');
          this.toggleBtn.textContent = 'Show Less';
          this.toggleBtn.classList.add('expanded');
          
          // Animate feature list items
          setTimeout(() => {
            const listItems = document.querySelectorAll('.features-list li');
            listItems.forEach((item, index) => {
              item.style.opacity = '0';
              item.style.transform = 'translateX(-20px)';
              setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
              }, index * 100);
            });
          }, 200);
        }
      }

      handleAction(action, message) {
        // Add button feedback
        const button = {
          'safe': this.safeBtn,
          'proceed': this.proceedBtn,
          'block': this.blockBtn,
          'info': this.infoBtn
        }[action];

        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
          button.style.transform = 'translateY(-2px)';
        }, 100);

        // Show notification
        this.showNotification(message, action);

        // Simulate action completion
        setTimeout(() => {
          if (action === 'proceed') {
            this.simulateRedirect();
          } else if (action === 'block') {
            this.simulateBlock();
          }
        }, 1500);
      }

      showNotification(message, type) {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) {
          existing.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type === 'safe' ? 'success' : type === 'block' ? 'danger' : 'warning'}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide notification
        setTimeout(() => {
          notification.classList.remove('show');
          setTimeout(() => notification.remove(), 300);
        }, 3000);
      }

      simulateRedirect() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(59, 130, 246, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          font-weight: 600;
          z-index: 9999;
          opacity: 0;
          transition: opacity 0.3s ease;
        `;
        overlay.textContent = 'Redirecting...';
        
        document.body.appendChild(overlay);
        setTimeout(() => overlay.style.opacity = '1', 100);
        
        setTimeout(() => {
          overlay.style.opacity = '0';
          setTimeout(() => overlay.remove(), 300);
        }, 2000);
      }

      simulateBlock() {
        const cards = document.querySelectorAll('.alert-card');
        cards.forEach(card => {
          card.style.filter = 'grayscale(1)';
          card.style.opacity = '0.5';
        });
        
        setTimeout(() => {
          cards.forEach(card => {
            card.style.filter = 'none';
            card.style.opacity = '1';
          });
        }, 2000);
      }
    }

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
      new PrivacyGuardUI();
    });
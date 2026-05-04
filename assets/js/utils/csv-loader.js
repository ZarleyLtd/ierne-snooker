// CSV Loading Utility
// Centralizes Papa.parse usage and error handling

const CsvLoader = {
  /**
   * Load CSV data from a URL
   * @param {string} url - CSV URL
   * @param {Object} options - Papa.parse options (merged with defaults)
   * @returns {Promise} Promise that resolves with parsed data array
   */
  load: function(url, options = {}) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('CSV URL is required'));
        return;
      }
      
      const defaultOptions = {
        download: true,
        header: true,
        skipEmptyLines: true
      };
      
      Papa.parse(url, {
        ...defaultOptions,
        ...options,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }
          resolve(results.data);
        },
        error: (error) => {
          console.error('CSV loading error:', error);
          reject(error);
        }
      });
    });
  }
};
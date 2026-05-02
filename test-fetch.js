fetch('http://localhost:3000/accounts')
  .then(res => res.text())
  .then(html => {
    if (html.includes('data-ui-version="accounts-boron-v2"')) {
      console.log('SUCCESS: Marker found in DOM!');
    } else {
      console.log('FAILED: Marker NOT found in DOM!');
    }
    if (html.includes('DashboardHeader')) {
      console.log('WARNING: DashboardHeader still exists in HTML output!');
    } else {
      console.log('SUCCESS: DashboardHeader is gone!');
    }
  })
  .catch(err => console.error(err));

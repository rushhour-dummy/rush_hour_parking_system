// Placeholder for the Google Maps integration (outside the trust boundary).
// Load the Maps JavaScript API here with your own API key, restricted to your domain.

export default function MapCard() {
  return (
    <section id="map" className="card map" aria-label="Location">
      <div className="card-head">
        <h2>Location</h2>
        <span className="muted small">Google Maps</span>
      </div>
      <div className="map-placeholder">[Embedded Google Map of the lot]</div>
      <a href="#map" className="map-link">Get directions</a>
    </section>
  );
}

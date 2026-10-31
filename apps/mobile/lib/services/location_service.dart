import 'dart:async';
import 'package:geolocator/geolocator.dart';

class LocationException implements Exception {
  const LocationException(this.message);
  final String message;
  @override
  String toString() => message;
}

class GpsCapture {
  const GpsCapture({required this.lat, required this.lng, required this.accuracy,
    required this.isMockLocation, required this.timestampMs});
  final double lat, lng, accuracy;
  final bool isMockLocation;
  final int timestampMs;
  Map<String, dynamic> toJson() => {
    'lat': lat, 'lng': lng, 'accuracy': accuracy,
    'isMockLocation': isMockLocation, 'timestampMs': timestampMs,
  };
}

class LocationService {
  static Future<GpsCapture> capture() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationException('Turn on your phone location services and try again.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      throw const LocationException('Allow location access in your phone settings, then try again.');
    }
    if (permission != LocationPermission.whileInUse && permission != LocationPermission.always) {
      throw const LocationException('Allow location access to record attendance.');
    }
    try {
      final position = await Geolocator.getCurrentPosition(locationSettings:
        const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)));
      // Send mock and low-accuracy readings to the server too, so rejection
      // evidence is retained rather than silently discarded on the phone.
      return GpsCapture(lat: position.latitude, lng: position.longitude,
        accuracy: position.accuracy, isMockLocation: position.isMocked,
        timestampMs: position.timestamp.millisecondsSinceEpoch);
    } on TimeoutException {
      throw const LocationException('Could not get a GPS fix. Move outside and try again.');
    } catch (_) {
      throw const LocationException('Could not read your location. Check location permissions and try again.');
    }
  }
}

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 240;

interface Props {
  isWithin: boolean;
  distanceMeters: number | null;
  radiusMeters: number;
  officeName: string;
  latitude?: number | null;
  longitude?: number | null;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  accuracyMeters?: number | null;
}

// Convert latitude and longitude to Slippy Map tile coordinates
function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

// Fractional tile positions for sub-pixel precision
function lon2rawTile(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function lat2rawTile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

export default function AttendanceRadar({
  isWithin,
  distanceMeters,
  radiusMeters,
  officeName,
  latitude,
  longitude,
  officeLatitude,
  officeLongitude,
  accuracyMeters,
}: Props) {
  const { colors, accentColors, isDark } = useAppTheme();
  const [zoom, setZoom] = useState(16);
  const [mapStyle, setMapStyle] = useState<'streets' | 'dark'>(isDark ? 'dark' : 'streets');

  // Center on office by default, or user if office not available
  const centerLat = officeLatitude ?? latitude ?? 12.9716;
  const centerLon = officeLongitude ?? longitude ?? 77.5946;

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 1, 18));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 1, 13));

  // Open native maps
  const handleOpenDirections = () => {
    if (officeLatitude && officeLongitude) {
      const label = encodeURIComponent(officeName || 'Office Headquarters');
      const url = Platform.select({
        ios: `maps:0,0?q=${label}@${officeLatitude},${officeLongitude}`,
        android: `geo:0,0?q=${officeLatitude},${officeLongitude}(${label})`,
        default: `https://www.google.com/maps/search/?api=1&query=${officeLatitude},${officeLongitude}`,
      });
      Linking.openURL(url || `https://www.google.com/maps?q=${officeLatitude},${officeLongitude}`);
    }
  };

  // Format strings
  const formattedDistance =
    distanceMeters !== null
      ? distanceMeters < 1000
        ? `${Math.round(distanceMeters)} m`
        : `${(distanceMeters / 1000).toFixed(2)} km`
      : 'Calculating...';

  const formattedAllowed =
    radiusMeters < 1000 ? `${radiusMeters} m` : `${(radiusMeters / 1000).toFixed(2)} km`;

  // Compute 3x3 map tiles around center point
  const mapData = useMemo(() => {
    const rawX = lon2rawTile(centerLon, zoom);
    const rawY = lat2rawTile(centerLat, zoom);
    const centerTileX = Math.floor(rawX);
    const centerTileY = Math.floor(rawY);

    const subX = (rawX - centerTileX) * 256;
    const subY = (rawY - centerTileY) * 256;

    // Tile server template
    // CartoDB Voyager (streets) and Dark Matter (dark) @2x retina tiles
    const stylePath = mapStyle === 'dark' ? 'dark_all' : 'voyager';
    const tileBase = `https://a.basemaps.cartocdn.com/rastertiles/${stylePath}/${zoom}`;

    const tiles: Array<{ x: number; y: number; url: string; left: number; top: number; key: string }> = [];

    const mapContainerWidth = SCREEN_WIDTH - 40;
    const originX = mapContainerWidth / 2 - subX;
    const originY = MAP_HEIGHT / 2 - subY;

    // 3x3 grid around center tile
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        tiles.push({
          x: tx,
          y: ty,
          url: `${tileBase}/${tx}/${ty}@2x.png`,
          left: originX + dx * 256,
          top: originY + dy * 256,
          key: `${zoom}-${tx}-${ty}`,
        });
      }
    }

    // Pixels per meter at this latitude and zoom
    const metersPerPixel = (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, zoom);
    const geofencePixelRadius = Math.max(12, Math.min(radiusMeters / metersPerPixel, 180));

    // Calculate user pin pixel offset relative to center
    let userPixelX: number | null = null;
    let userPixelY: number | null = null;
    if (latitude != null && longitude != null) {
      const userRawX = lon2rawTile(longitude, zoom);
      const userRawY = lat2rawTile(latitude, zoom);
      userPixelX = mapContainerWidth / 2 + (userRawX - rawX) * 256;
      userPixelY = MAP_HEIGHT / 2 + (userRawY - rawY) * 256;
    }

    // Office marker is centered at (mapContainerWidth / 2, MAP_HEIGHT / 2)
    const officePixelX = mapContainerWidth / 2;
    const officePixelY = MAP_HEIGHT / 2;

    return {
      tiles,
      geofencePixelRadius,
      officePixelX,
      officePixelY,
      userPixelX,
      userPixelY,
    };
  }, [centerLat, centerLon, zoom, mapStyle, radiusMeters, latitude, longitude]);

  const styles = getStyles(colors, accentColors, isDark, isWithin);

  return (
    <View style={styles.container}>
      {/* High-Resolution Map Container */}
      <View style={styles.mapViewport}>
        {/* Render 3x3 seamless raster tiles */}
        <View style={styles.tileCanvas} pointerEvents="none">
          {mapData.tiles.map((tile) => (
            <Image
              key={tile.key}
              source={{ uri: tile.url }}
              style={[
                styles.mapTile,
                {
                  left: tile.left,
                  top: tile.top,
                },
              ]}
              resizeMode="cover"
            />
          ))}
        </View>

        {/* Geofence Perimeter Ring */}
        <View
          pointerEvents="none"
          style={[
            styles.geofenceCircle,
            {
              left: mapData.officePixelX - mapData.geofencePixelRadius,
              top: mapData.officePixelY - mapData.geofencePixelRadius,
              width: mapData.geofencePixelRadius * 2,
              height: mapData.geofencePixelRadius * 2,
              borderRadius: mapData.geofencePixelRadius,
              borderColor: isWithin ? '#10b981' : '#f59e0b',
              backgroundColor: isWithin ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.15)',
            },
          ]}
        />

        {/* Office Location Marker */}
        <View
          style={[
            styles.markerWrapper,
            {
              left: mapData.officePixelX - 18,
              top: mapData.officePixelY - 36,
            },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.markerPin, { backgroundColor: accentColors.primary }]}>
            <Ionicons name="business" size={16} color="#ffffff" />
          </View>
          <View style={styles.markerStem} />
        </View>

        {/* Live User GPS Marker */}
        {mapData.userPixelX !== null && mapData.userPixelY !== null && (
          <View
            style={[
              styles.userMarkerWrapper,
              {
                left: mapData.userPixelX - 14,
                top: mapData.userPixelY - 14,
              },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.userPulseRing,
                { backgroundColor: isWithin ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)' },
              ]}
            />
            <View
              style={[
                styles.userDot,
                { backgroundColor: isWithin ? '#10b981' : '#ef4444' },
              ]}
            >
              <Ionicons name="person" size={11} color="#ffffff" />
            </View>
          </View>
        )}

        {/* Map Controls Floating Overlay */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.controlBtn} onPress={handleZoomIn} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.controlDivider} />
          <TouchableOpacity style={styles.controlBtn} onPress={handleZoomOut} activeOpacity={0.8}>
            <Ionicons name="remove" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Map Style & Directions Switcher */}
        <View style={styles.mapTopControls}>
          <TouchableOpacity
            style={styles.pillControl}
            onPress={() => setMapStyle((s) => (s === 'streets' ? 'dark' : 'streets'))}
            activeOpacity={0.8}
          >
            <Ionicons name={mapStyle === 'dark' ? 'moon' : 'sunny'} size={13} color={colors.text} />
            <Text style={styles.pillControlText}>{mapStyle === 'dark' ? 'Dark' : 'Streets'}</Text>
          </TouchableOpacity>

          {officeLatitude && officeLongitude && (
            <TouchableOpacity style={styles.pillControl} onPress={handleOpenDirections} activeOpacity={0.8}>
              <Ionicons name="navigate-outline" size={13} color={accentColors.primary} />
              <Text style={[styles.pillControlText, { color: accentColors.primary }]}>Directions</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Map Attribution Bar */}
        <View style={styles.attributionBadge}>
          <Text style={styles.attributionText}>© OpenStreetMap © CARTO</Text>
        </View>
      </View>

      {/* Target & Telemetry Details */}
      <View style={styles.detailsContainer}>
        <View style={styles.officeRow}>
          <Ionicons name="location-sharp" size={18} color={accentColors.primary} />
          <Text style={styles.officeTitle} numberOfLines={1}>
            {officeName || 'Office Headquarters'}
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>DISTANCE TO OFFICE</Text>
            <Text style={[styles.metricValue, { color: isWithin ? '#10b981' : '#ef4444' }]}>
              {formattedDistance}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>GEOFENCE PERIMETER</Text>
            <Text style={styles.metricValue}>{formattedAllowed}</Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>GPS COORDINATES</Text>
            <Text style={styles.metricSubValue} numberOfLines={1}>
              {latitude && longitude
                ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                : 'Acquiring GPS...'}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>STATUS</Text>
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isWithin ? '#10b981' : '#ef4444' },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: isWithin ? '#10b981' : '#ef4444' },
                ]}
              >
                {isWithin ? 'Inside Perimeter' : 'Outside Perimeter'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean, isWithin: boolean) =>
  StyleSheet.create({
    container: {
      backgroundColor: isDark ? '#0b1329' : '#f8fafc',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      marginTop: 8,
    },
    mapViewport: {
      height: MAP_HEIGHT,
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: isDark ? '#111827' : '#e2e8f0',
    },
    tileCanvas: {
      position: 'absolute',
      width: '100%',
      height: '100%',
    },
    mapTile: {
      position: 'absolute',
      width: 256,
      height: 256,
    },
    geofenceCircle: {
      position: 'absolute',
      borderWidth: 2,
      borderStyle: 'dashed',
    },
    markerWrapper: {
      position: 'absolute',
      alignItems: 'center',
      zIndex: 10,
    },
    markerPin: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 6,
      borderWidth: 2,
      borderColor: '#ffffff',
    },
    markerStem: {
      width: 3,
      height: 6,
      backgroundColor: accentColors.primary,
    },
    userMarkerWrapper: {
      position: 'absolute',
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
    },
    userPulseRing: {
      position: 'absolute',
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    userDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#ffffff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 5,
    },
    mapControls: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      backgroundColor: colors.backgroundCard,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
      zIndex: 30,
    },
    controlBtn: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    mapTopControls: {
      position: 'absolute',
      top: 10,
      left: 12,
      flexDirection: 'row',
      gap: 8,
      zIndex: 30,
    },
    pillControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 2,
    },
    pillControlText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text,
    },
    attributionBadge: {
      position: 'absolute',
      right: 8,
      bottom: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    attributionText: {
      fontSize: 8,
      color: '#e2e8f0',
      fontWeight: '500',
    },
    detailsContainer: {
      padding: 16,
      backgroundColor: colors.backgroundCard,
    },
    officeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      marginBottom: 12,
    },
    officeTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    metricItem: {
      width: '47%',
      backgroundColor: isDark ? '#1e293b40' : '#f1f5f960',
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    metricLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: colors.textMuted,
      marginBottom: 4,
    },
    metricValue: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    metricSubValue: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '700',
    },
  });

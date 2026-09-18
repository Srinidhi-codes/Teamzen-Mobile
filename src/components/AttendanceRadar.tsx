import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

interface Props {
  isWithin: boolean;
  distanceMeters: number | null;
  radiusMeters: number;
  officeName: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
}

export default function AttendanceRadar({
  isWithin,
  distanceMeters,
  radiusMeters,
  officeName,
  latitude,
  longitude,
  accuracyMeters,
}: Props) {
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark, isWithin);

  const formattedDistance =
    distanceMeters !== null
      ? distanceMeters < 1000
        ? `${Math.round(distanceMeters)} m`
        : `${(distanceMeters / 1000).toFixed(2)} km`
      : 'Calculating...';

  const formattedAllowed =
    radiusMeters < 1000 ? `${radiusMeters} m` : `${(radiusMeters / 1000).toFixed(2)} km`;

  // Visual offsets for the user dot based on distance ratio
  // Clamped so the dot stays gracefully inside the container
  const maxRadiusPx = 70;
  const ratio = distanceMeters ? Math.min(distanceMeters / Math.max(radiusMeters * 2, 1), 1.2) : 0;
  const dotOffset = ratio * maxRadiusPx;

  return (
    <View style={styles.container}>
      {/* Radar Graphic */}
      <View style={styles.radarFrame}>
        {/* Outer ambient wave */}
        <View style={styles.outerRing} />
        {/* Geofence boundary circle */}
        <View style={styles.geofenceCircle}>
          <Text style={styles.geofenceTag}>{formattedAllowed} perimeter</Text>
        </View>

        {/* Office Center Marker */}
        <View style={styles.officeMarker}>
          <Ionicons name="business" size={18} color="#ffffff" />
        </View>

        {/* Connecting vector indicator */}
        <View
          style={[
            styles.vectorLine,
            {
              height: dotOffset,
              transform: [{ rotate: '45deg' }],
            },
          ]}
        />

        {/* User GPS Pin */}
        <View
          style={[
            styles.userMarker,
            {
              transform: [
                { translateX: dotOffset * 0.7 },
                { translateY: -dotOffset * 0.7 },
              ],
            },
          ]}
        >
          <View style={styles.userPulse} />
          <Ionicons name="person" size={14} color="#ffffff" />
        </View>
      </View>

      {/* Target & Telemetry Details */}
      <View style={styles.detailsContainer}>
        <View style={styles.officeRow}>
          <Ionicons name="navigate-circle" size={18} color={accentColors.primary} />
          <Text style={styles.officeTitle} numberOfLines={1}>
            {officeName || 'Office Headquarters'}
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>CURRENT DISTANCE</Text>
            <Text style={[styles.metricValue, { color: isWithin ? '#10b981' : '#ef4444' }]}>
              {formattedDistance}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>GEOFENCE RADIUS</Text>
            <Text style={styles.metricValue}>{formattedAllowed}</Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>GPS COORD</Text>
            <Text style={styles.metricSubValue} numberOfLines={1}>
              {latitude && longitude
                ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                : 'Resolving...'}
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
                {isWithin ? 'In Range' : 'Out of Range'}
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
    radarFrame: {
      height: 200,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#070d1e' : '#edf2f7',
      position: 'relative',
      overflow: 'hidden',
    },
    outerRing: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 130,
      borderWidth: 1,
      borderColor: isDark ? '#1e293b60' : '#cbd5e160',
      borderStyle: 'dashed',
    },
    geofenceCircle: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 2,
      borderColor: isWithin ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)',
      backgroundColor: isWithin ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingTop: 8,
    },
    geofenceTag: {
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: isWithin ? '#10b981' : '#ef4444',
    },
    officeMarker: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: accentColors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
      zIndex: 10,
    },
    vectorLine: {
      position: 'absolute',
      width: 1.5,
      backgroundColor: isWithin ? '#10b981' : '#ef4444',
      opacity: 0.6,
      bottom: '50%',
      transformOrigin: 'bottom center',
    },
    userMarker: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isWithin ? '#10b981' : '#ef4444',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    userPulse: {
      position: 'absolute',
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: isWithin ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
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

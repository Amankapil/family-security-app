package com.familysafety.app.service

import android.app.PendingIntent
import android.content.Intent
import android.media.RingtoneManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.familysafety.app.FamilySafetyApp
import com.familysafety.app.R
import com.familysafety.app.data.local.PreferencesManager
import com.familysafety.app.data.remote.ApiClient
import com.familysafety.app.ui.MainActivity
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class FamilyFirebaseMessagingService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var preferencesManager: PreferencesManager

    override fun onCreate() {
        super.onCreate()
        preferencesManager = PreferencesManager(this)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM Token received: $token")
        preferencesManager.fcmToken = token

        // Sync with backend if device is already paired
        if (preferencesManager.isPaired) {
            serviceScope.launch {
                try {
                    val response = ApiClient.apiService.updateFcmToken(mapOf("fcmToken" to token))
                    if (response.isSuccessful) {
                        Log.d(TAG, "FCM token synced successfully with Family Safety Network.")
                    } else {
                        Log.w(TAG, "Failed to sync FCM token: ${response.code()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error syncing FCM token", e)
                }
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "FCM Message received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        val type = data["type"] ?: "GENERAL"
        val title = remoteMessage.notification?.title ?: data["title"] ?: getString(R.string.app_name)
        val body = remoteMessage.notification?.body ?: data["body"] ?: "New update from your family network."

        when (type) {
            "SOS" -> handleSosAlert(title, body, data)
            "GEOFENCE" -> handleGeofenceAlert(title, body, data)
            "LOW_BATTERY" -> handleLowBatteryAlert(title, body, data)
            else -> showNotification(
                title,
                body,
                FamilySafetyApp.CHANNEL_JOURNEY,
                NOTIFICATION_ID_GENERAL,
                NotificationCompat.PRIORITY_DEFAULT
            )
        }
    }

    private fun handleSosAlert(title: String, body: String, data: Map<String, String>) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("EXTRA_SOS_ACTIVE", true)
            putExtra("EXTRA_ALERT_ID", data["alertId"])
            putExtra("EXTRA_MEMBER_NAME", data["displayName"])
            putExtra("EXTRA_LATITUDE", data["latitude"])
            putExtra("EXTRA_LONGITUDE", data["longitude"])
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID_SOS,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notification = NotificationCompat.Builder(this, FamilySafetyApp.CHANNEL_EMERGENCY)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(alarmSound)
            .setVibrate(longArrayOf(0, 500, 200, 500, 200, 1000))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID_SOS, notification)
        } catch (e: SecurityException) {
            Log.e(TAG, "Notification permission not granted", e)
        }
    }

    private fun handleGeofenceAlert(title: String, body: String, data: Map<String, String>) {
        showNotification(
            title,
            body,
            FamilySafetyApp.CHANNEL_JOURNEY,
            NOTIFICATION_ID_GEOFENCE,
            NotificationCompat.PRIORITY_HIGH
        )
    }

    private fun handleLowBatteryAlert(title: String, body: String, data: Map<String, String>) {
        showNotification(
            title,
            body,
            FamilySafetyApp.CHANNEL_JOURNEY,
            NOTIFICATION_ID_BATTERY,
            NotificationCompat.PRIORITY_DEFAULT
        )
    }

    private fun showNotification(
        title: String,
        body: String,
        channelId: String,
        notificationId: Int,
        priority: Int
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(priority)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(notificationId, notification)
        } catch (e: SecurityException) {
            Log.e(TAG, "Notification permission not granted", e)
        }
    }

    companion object {
        private const val TAG = "FamilyFCMService"
        private const val NOTIFICATION_ID_SOS = 911
        private const val NOTIFICATION_ID_GEOFENCE = 912
        private const val NOTIFICATION_ID_BATTERY = 913
        private const val NOTIFICATION_ID_GENERAL = 914
    }
}

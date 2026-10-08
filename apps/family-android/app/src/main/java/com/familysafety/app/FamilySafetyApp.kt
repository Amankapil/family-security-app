package com.familysafety.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.familysafety.app.data.local.PreferencesManager
import com.familysafety.app.data.remote.ApiClient
import com.familysafety.app.service.LocationSyncWorker

class FamilySafetyApp : Application() {

    lateinit var preferencesManager: PreferencesManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        preferencesManager = PreferencesManager(this)
        ApiClient.initialize(this, preferencesManager)
        createNotificationChannels()
        LocationSyncWorker.schedulePeriodicSync(this)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Persistent Foreground Location Service Channel
            val serviceChannel = NotificationChannel(
                CHANNEL_SERVICE,
                "Family Protection Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows that your safety tracking is actively protecting you."
                setShowBadge(false)
            }

            // 2. High-Priority Emergency / SOS Alerts Channel
            val emergencyChannel = NotificationChannel(
                CHANNEL_EMERGENCY,
                "Emergency & SOS Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical alerts when a family member triggers SOS."
                enableVibration(true)
                enableLights(true)
            }

            // 3. Journey Updates Channel
            val journeyChannel = NotificationChannel(
                CHANNEL_JOURNEY,
                "Journey Updates",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Updates when family members depart or reach home/work."
            }

            notificationManager.createNotificationChannels(
                listOf(serviceChannel, emergencyChannel, journeyChannel)
            )
        }
    }

    companion object {
        const val CHANNEL_SERVICE = "channel_protection_service"
        const val CHANNEL_EMERGENCY = "channel_emergency_sos"
        const val CHANNEL_JOURNEY = "channel_journey_updates"

        lateinit var instance: FamilySafetyApp
            private set
    }
}

package com.familysafety.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.familysafety.app.FamilySafetyApp
import com.familysafety.app.util.PermissionHelper

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return

        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val prefs = FamilySafetyApp.instance.preferencesManager

            // Only resume service if the phone has been authorized and paired with family
            if (prefs.isPaired && PermissionHelper.hasFineLocation(context)) {
                LocationService.start(context)
            }
        }
    }
}

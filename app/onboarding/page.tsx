import React from "react";

export default function OnboardingPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-2 text-center">You are almost finished!</h2>
        <p className="text-gray-500 mb-6 text-center">Enter your information to create an account</p>
        <form className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input
                type="text"
                placeholder="John"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input
                type="text"
                placeholder="Doe"
                className="w-full border border-gray-200 bg-gray-50 rounded px-3 py-2 focus:outline-none"
                disabled
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input
              type="text"
              placeholder="Chad street 123"
              className="w-full border border-gray-200 bg-gray-50 rounded px-3 py-2 focus:outline-none"
              disabled
            />
          </div>
          <button
            type="submit"
            className="w-full bg-black text-white py-2 rounded mt-2 hover:bg-gray-900 transition-colors"
          >
            Finish onboarding
          </button>
        </form>
      </div>
    </div>
  );
}

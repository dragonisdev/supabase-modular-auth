import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center mb-8">Authentication Demo</h1>

        <div className="space-y-4">
          <Link
            href="/register"
            className="block w-full py-3 px-4 bg-blue-600 text-white text-center rounded-md hover:bg-blue-700 transition-colors"
          >
            Register
          </Link>

          <Link
            href="/login"
            className="block w-full py-3 px-4 bg-green-600 text-white text-center rounded-md hover:bg-green-700 transition-colors"
          >
            Login
          </Link>

          <Link
            href="/dashboard"
            className="block w-full py-3 px-4 bg-gray-600 text-white text-center rounded-md hover:bg-gray-700 transition-colors"
          >
            Dashboard
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            A simple authentication system built with Next.js and Supabase
          </p>
        </div>
      </div>
    </div>
  );
}

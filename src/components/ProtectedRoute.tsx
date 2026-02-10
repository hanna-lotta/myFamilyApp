import { Navigate } from 'react-router';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
	children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
	const token = localStorage.getItem('jwt');
	
	if (!token) {
		return <Navigate to="/" replace />;
	}
	
	return <>{children}</>;
};

export default ProtectedRoute;

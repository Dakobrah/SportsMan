import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory

from apps.core.exceptions import custom_exception_handler, BusinessLogicError


@pytest.mark.django_db
def test_custom_exception_handler_validation_error():
    factory = APIRequestFactory()
    request = factory.post('/api/test/', {}, format='json')
    exc = ValidationError({'name': ['This field is required.']})
    context = {'request': request}

    response = custom_exception_handler(exc, context)

    assert response is not None
    data = response.data
    assert isinstance(data, dict)
    assert data.get('type') == 'about:blank'
    assert data.get('status') == 400
    assert 'errors' in data
    assert 'name' in data['errors']


def test_business_logic_error_returns_422():
    factory = APIRequestFactory()
    request = factory.get('/api/test/')
    exc = BusinessLogicError('Rule violated')
    context = {'request': request}

    response = custom_exception_handler(exc, context)

    # BusinessLogicError is an APIException subclass with status 422
    assert response is not None
    assert response.status_code == 422
    assert response.data.get('status') == 422
